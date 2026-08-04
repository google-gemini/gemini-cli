/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, no-restricted-syntax --
 * This file converts between the Gemini SDK types and the untyped
 * OpenAI-compatible wire format served by SGLang; structural checks and
 * assertions against parsed JSON are unavoidable here. */

import {
  GenerateContentResponse,
  FinishReason,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type GenerateContentParameters,
  type GenerateContentConfig,
  type Content,
  type ContentUnion,
  type Part,
  type FunctionDeclaration,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/types.js';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Recursively normalizes a JSON schema for OpenAI-compatible servers:
 * lowercases `type` values (Gemini uses upper case enums) and recurses
 * into all nested schema locations.
 */
function cleanSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map(cleanSchema);
  }
  const obj = { ...(schema as Record<string, unknown>) };
  delete obj['$schema'];
  if (typeof obj['type'] === 'string') {
    obj['type'] = obj['type'].toLowerCase();
  } else if (Array.isArray(obj['type'])) {
    obj['type'] = (obj['type'] as unknown[]).map((t) =>
      typeof t === 'string' ? t.toLowerCase() : t,
    );
  }
  for (const key of ['properties', '$defs', 'definitions']) {
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(
        obj[key] as Record<string, unknown>,
      )) {
        mapped[k] = cleanSchema(v);
      }
      obj[key] = mapped;
    }
  }
  for (const key of [
    'items',
    'additionalProperties',
    'anyOf',
    'oneOf',
    'allOf',
    'prefixItems',
    'not',
  ]) {
    if (obj[key] !== undefined && typeof obj[key] === 'object') {
      obj[key] = cleanSchema(obj[key]);
    }
  }
  return obj;
}

function mapFinishReason(reason?: string | null): FinishReason | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case 'length':
      return FinishReason.MAX_TOKENS;
    case 'content_filter':
      return FinishReason.SAFETY;
    case 'stop':
    case 'tool_calls':
    case 'function_call':
    default:
      return FinishReason.STOP;
  }
}

function extractText(content: ContentUnion | string | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'string' ? p : (p.text ?? '')))
      .filter(Boolean)
      .join('\n');
  }
  const maybeContent = content as Content;
  if (Array.isArray(maybeContent.parts)) {
    return maybeContent.parts
      .map((p) => p.text)
      .filter(Boolean)
      .join('\n');
  }
  return (content as Part).text ?? '';
}

/**
 * Extracts a plain-text payload from a Gemini functionResponse to send as
 * an OpenAI `tool` message.
 */
function functionResponseToText(response: unknown): string {
  if (response === null || response === undefined) return '';
  if (typeof response === 'string') return response;
  if (typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (typeof obj['output'] === 'string') return obj['output'];
    if (obj['error'] !== undefined) {
      return typeof obj['error'] === 'string'
        ? `Error: ${obj['error']}`
        : `Error: ${JSON.stringify(obj['error'])}`;
    }
  }
  try {
    return JSON.stringify(response);
  } catch {
    return String(response);
  }
}

/**
 * ContentGenerator implementation for an SGLang (OpenAI-compatible) server,
 * e.g. a multi-node Kimi-K3 deployment launched with
 * `--tool-call-parser kimi_k3 --reasoning-parser kimi_k3`.
 *
 * Notes on correctness (things the rest of gemini-cli relies on):
 * - Responses MUST be real `GenerateContentResponse` instances: turn.ts and
 *   geminiChat.ts use the SDK class getters (`resp.functionCalls`) to
 *   dispatch tool calls. Plain object literals silently break tool use.
 * - functionCall parts must carry stable `id`s and history conversion must
 *   reuse them so `tool_calls[].id` matches the `tool` message
 *   `tool_call_id` across turns.
 * - `config.abortSignal` must be honored so ESC cancels generation.
 * - Never write to stdout/stderr: it corrupts the Ink UI.
 */
export class SglangContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private defaultModel: string;
  private apiKey?: string;
  private syntheticIdCounter = 0;

  constructor(
    baseUrl: string = 'http://127.0.0.1:30100/v1',
    defaultModel: string = 'moonshotai/Kimi-K3',
    apiKey?: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultModel = defaultModel;
    this.apiKey =
      apiKey ||
      process.env['SGLANG_API_KEY'] ||
      process.env['OPENAI_API_KEY'] ||
      undefined;
  }

  /**
   * The CLI resolves gemini-* model aliases internally; the sglang server
   * only knows its own served model name. Map anything that doesn't look
   * like a served model onto the configured default.
   */
  private resolveModelName(requested?: string | null): string {
    if (!requested) return this.defaultModel;
    if (
      requested === 'auto' ||
      requested.startsWith('gemini') ||
      requested.startsWith('gemma') ||
      requested === 'none'
    ) {
      return this.defaultModel;
    }
    return requested;
  }

  private normalizeContents(
    contents: GenerateContentParameters['contents'],
  ): Content[] {
    if (!contents) return [];
    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    }
    const list = Array.isArray(contents) ? contents : [contents];
    const result: Content[] = [];
    for (const item of list) {
      if (typeof item === 'string') {
        result.push({ role: 'user', parts: [{ text: item }] });
      } else if (
        item &&
        typeof item === 'object' &&
        ('role' in item || 'parts' in item)
      ) {
        result.push(item);
      } else if (item && typeof item === 'object') {
        // A bare Part.
        result.push({ role: 'user', parts: [item as Part] });
      }
    }
    return result;
  }

  private convertContentsToMessages(
    contents: GenerateContentParameters['contents'],
    systemInstruction?: ContentUnion | string,
  ): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    const systemText = extractText(systemInstruction);
    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }

    // Queue of auto-assigned tool call ids, used to pair functionResponses
    // that arrive without an id to the calls they answer (FIFO order).
    const pendingAutoIds: string[] = [];

    for (const c of this.normalizeContents(contents)) {
      if (!c.parts || c.parts.length === 0) continue;
      const isModel = c.role === 'model';

      let text = '';
      const toolCalls: OpenAIToolCall[] = [];
      const toolResponses: Array<{ id: string; content: string }> = [];

      for (const part of c.parts) {
        // Never re-send reasoning/thought parts back to the server.
        if (part.thought) continue;

        if (part.text) {
          text += (text ? '\n' : '') + part.text;
        }
        if (part.functionCall) {
          let id = part.functionCall.id;
          if (!id) {
            id = `call_auto_${this.syntheticIdCounter++}`;
            pendingAutoIds.push(id);
          }
          toolCalls.push({
            id,
            type: 'function',
            function: {
              name: part.functionCall.name || 'unknown_tool',
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
        if (part.functionResponse) {
          const id =
            part.functionResponse.id ||
            pendingAutoIds.shift() ||
            `call_auto_${this.syntheticIdCounter++}`;
          toolResponses.push({
            id,
            content: functionResponseToText(part.functionResponse.response),
          });
        }
      }

      // Tool results must directly follow the assistant message that
      // requested them.
      for (const tr of toolResponses) {
        messages.push({
          role: 'tool',
          tool_call_id: tr.id,
          content: tr.content,
        });
      }

      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        });
      } else if (text) {
        messages.push({
          role: isModel ? 'assistant' : 'user',
          content: text,
        });
      }
    }

    if (messages.filter((m) => m.role !== 'system').length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    return messages;
  }

  private convertTools(config?: GenerateContentConfig) {
    if (!config?.tools || !Array.isArray(config.tools)) {
      return undefined;
    }
    const tools: Array<{
      type: 'function';
      function: { name: string; description?: string; parameters?: unknown };
    }> = [];

    for (const t of config.tools) {
      const declarations = (
        t as { functionDeclarations?: FunctionDeclaration[] }
      ).functionDeclarations;
      if (!Array.isArray(declarations)) continue;
      for (const fd of declarations) {
        if (!fd.name) continue;
        // gemini-cli built-in tools declare `parametersJsonSchema`
        // (raw JSON schema); MCP/legacy tools may use `parameters`.
        const schema =
          (fd as { parametersJsonSchema?: unknown }).parametersJsonSchema ??
          fd.parameters;
        tools.push({
          type: 'function',
          function: {
            name: fd.name,
            description: fd.description,
            parameters: cleanSchema(schema) ?? {
              type: 'object',
              properties: {},
            },
          },
        });
      }
    }
    return tools.length > 0 ? tools : undefined;
  }

  private buildPayload(
    request: GenerateContentParameters,
    stream: boolean,
  ): Record<string, unknown> {
    const config = request.config;
    const messages = this.convertContentsToMessages(
      request.contents,
      config?.systemInstruction,
    );
    const tools = this.convertTools(config);

    const payload: Record<string, unknown> = {
      model: this.resolveModelName(request.model),
      messages,
      stream,
      // Large default: Kimi-K3 edits/writes whole files through tool
      // arguments; a small cap truncates them into malformed JSON.
      max_tokens: config?.maxOutputTokens ?? 32768,
    };
    if (stream) {
      payload['stream_options'] = { include_usage: true };
    }
    if (config?.temperature !== undefined) {
      payload['temperature'] = config.temperature;
    }
    if (config?.topP !== undefined) {
      payload['top_p'] = config.topP;
    }
    if (config?.stopSequences && config.stopSequences.length > 0) {
      payload['stop'] = config.stopSequences;
    }
    if (tools) {
      payload['tools'] = tools;
      const mode = config?.toolConfig?.functionCallingConfig?.mode;
      if (mode === 'ANY') {
        payload['tool_choice'] = 'required';
      } else if (mode === 'NONE') {
        payload['tool_choice'] = 'none';
      }
    }

    // Structured output for internal utility calls (generateJson):
    // next-speaker checks, loop detection, summarization, etc.
    const jsonSchema =
      (config as { responseJsonSchema?: unknown })?.responseJsonSchema ??
      config?.responseSchema;
    if (jsonSchema) {
      payload['response_format'] = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: cleanSchema(jsonSchema),
        },
      };
    } else if (config?.responseMimeType === 'application/json') {
      payload['response_format'] = { type: 'json_object' };
    }

    return payload;
  }

  private async postChatCompletions(
    payload: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortSignal ?? null,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(
        `Failed to reach SGLang server at ${this.baseUrl}/chat/completions. ` +
          `Is kubectl port-forward running? ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SGLang server error (${res.status}): ${errText}`);
    }
    return res;
  }

  private makeResponse(
    parts: Part[],
    finishReason?: FinishReason,
    usage?: OpenAIUsage,
    responseId?: string,
    modelVersion?: string,
  ): GenerateContentResponse {
    const response = new GenerateContentResponse();
    response.candidates = [
      {
        content: { parts, role: 'model' },
        ...(finishReason ? { finishReason } : {}),
        index: 0,
      },
    ];
    if (usage) {
      response.usageMetadata = {
        promptTokenCount: usage.prompt_tokens ?? 0,
        candidatesTokenCount: usage.completion_tokens ?? 0,
        totalTokenCount: usage.total_tokens ?? 0,
      };
    }
    if (responseId) {
      response.responseId = responseId;
    }
    if (modelVersion) {
      response.modelVersion = modelVersion;
    }
    return response;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const payload = this.buildPayload(request, false);
    const res = await this.postChatCompletions(
      payload,
      request.config?.abortSignal,
    );
    const data = (await res.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: OpenAIUsage;
    };

    const choice = data.choices?.[0];
    const message = choice?.message;
    const parts: Part[] = [];

    if (message?.reasoning_content) {
      parts.push({ text: message.reasoning_content, thought: true });
    }
    if (message?.content) {
      parts.push({ text: message.content });
    }
    if (Array.isArray(message?.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (!tc.function?.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<
            string,
            unknown
          >;
        } catch {
          // Leave args empty if the server returned malformed JSON.
        }
        parts.push({
          functionCall: {
            id: tc.id || `call_auto_${this.syntheticIdCounter++}`,
            name: tc.function.name,
            args,
          },
        });
      }
    }

    return this.makeResponse(
      parts,
      mapFinishReason(choice?.finish_reason) ?? FinishReason.STOP,
      data.usage,
      data.id,
      data.model,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const payload = this.buildPayload(request, true);
    const res = await this.postChatCompletions(
      payload,
      request.config?.abortSignal,
    );
    if (!res.body) {
      throw new Error('SGLang server returned an empty stream body.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    async function* makeStream(): AsyncGenerator<GenerateContentResponse> {
      let buffer = '';
      let sentFinish = false;
      let usage: OpenAIUsage | undefined;
      let responseId: string | undefined;
      let modelVersion: string | undefined;
      const toolCalls = new Map<
        number,
        { id?: string; name?: string; arguments: string }
      >();

      const flushToolCallParts = (): Part[] => {
        const parts: Part[] = [];
        const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
        for (const [, tc] of sorted) {
          if (!tc.name) continue;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
          } catch {
            // Malformed JSON args; send empty args rather than crashing.
          }
          parts.push({
            functionCall: {
              id: tc.id || `call_auto_${self.syntheticIdCounter++}`,
              name: tc.name,
              args,
            },
          });
        }
        toolCalls.clear();
        return parts;
      };

      const handleData = function* (
        json: Record<string, unknown>,
      ): Generator<GenerateContentResponse> {
        if (typeof json['id'] === 'string') responseId = json['id'];
        if (typeof json['model'] === 'string') modelVersion = json['model'];
        if (json['usage']) {
          usage = json['usage'] as OpenAIUsage;
        }
        const choice = (
          json['choices'] as
            | Array<{
                delta?: {
                  content?: string | null;
                  reasoning_content?: string | null;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>
            | undefined
        )?.[0];
        if (!choice) return;

        const delta = choice.delta;
        const parts: Part[] = [];

        if (delta?.reasoning_content) {
          // Prefix with a bold subject so gemini-cli's thought parser
          // (which expects `**Subject** description`) renders a stable
          // "Thinking" label instead of arbitrary reasoning fragments.
          parts.push({
            text: `**Thinking** ${delta.reasoning_content}`,
            thought: true,
          });
        }
        if (delta?.content) {
          parts.push({ text: delta.content });
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCalls.get(idx) ?? { arguments: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
            toolCalls.set(idx, existing);
          }
        }

        const finishReason = mapFinishReason(choice.finish_reason);
        if (finishReason) {
          // Flush any accumulated tool calls together with the finish
          // chunk so downstream consumers see calls before/with Finished.
          parts.push(...flushToolCallParts());
          sentFinish = true;
          yield self.makeResponse(
            parts,
            finishReason,
            usage,
            responseId,
            modelVersion,
          );
          return;
        }

        if (parts.length > 0) {
          yield self.makeResponse(
            parts,
            undefined,
            undefined,
            responseId,
            modelVersion,
          );
        }
      };

      try {
        streamLoop: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              break streamLoop;
            }
            let json: Record<string, unknown>;
            try {
              json = JSON.parse(data) as Record<string, unknown>;
            } catch {
              continue; // Ignore malformed keep-alive/partial lines.
            }
            yield* handleData(json);
          }
        }
      } finally {
        reader.releaseLock();
        try {
          await res.body?.cancel();
        } catch {
          // Stream already closed.
        }
      }

      // Stream ended without an explicit finish chunk, or tool calls are
      // still pending: emit a final chunk so geminiChat always sees a
      // finish reason (it throws InvalidStreamError otherwise).
      const trailingParts = flushToolCallParts();
      if (!sentFinish || trailingParts.length > 0) {
        yield self.makeResponse(
          trailingParts,
          FinishReason.STOP,
          usage,
          responseId,
          modelVersion,
        );
      } else if (usage) {
        // Usage arrived after the finish chunk (stream_options.include_usage):
        // surface it in a trailing metadata-only chunk.
        const response = new GenerateContentResponse();
        response.candidates = [];
        response.usageMetadata = {
          promptTokenCount: usage.prompt_tokens ?? 0,
          candidatesTokenCount: usage.completion_tokens ?? 0,
          totalTokenCount: usage.total_tokens ?? 0,
        };
        if (responseId) response.responseId = responseId;
        if (modelVersion) response.modelVersion = modelVersion;
        yield response;
      }
    }

    return makeStream();
  }

  /**
   * SGLang has no public tokenizer endpoint wired up here; approximate
   * (~4 chars/token) so context-compression heuristics still function.
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    let chars = 0;
    try {
      chars = JSON.stringify(request.contents ?? '').length;
    } catch {
      chars = 0;
    }
    return { totalTokens: Math.ceil(chars / 4) };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'Embeddings are not supported by the SGLang content generator.',
    );
  }
}
