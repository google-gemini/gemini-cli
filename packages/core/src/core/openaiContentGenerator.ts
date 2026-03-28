/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  GenerateContentResponse as GeminiResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  FunctionDeclaration,
} from '@google/genai';
import { GenerateContentResponse, FinishReason } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { tokenLimit } from './tokenLimits.js';

// ---------------------------------------------------------------------------
// Pre-send context budget enforcement
// ---------------------------------------------------------------------------
// OpenAI-compatible providers lack a countTokens endpoint, so the compression
// service never knows it's over budget until the API rejects the request.
// We estimate token count from the serialized request and trim the largest
// tool outputs to fit.

const CONTEXT_BUDGET_RATIO = 0.7;
const MIN_TOOL_CONTENT_CHARS = 500;

function estimateTokens(messages: OpenAIMessage[], tools?: unknown): number {
  const msgLen = JSON.stringify(messages).length;
  const toolLen = tools ? JSON.stringify(tools).length : 0;
  return Math.ceil((msgLen + toolLen) / 3);
}

function trimMessagesForContextBudget(
  messages: OpenAIMessage[],
  tools: unknown | undefined,
  model: string,
): OpenAIMessage[] {
  const limit = tokenLimit(model);
  if (limit >= 1_000_000) return messages;

  const budget = Math.floor(limit * CONTEXT_BUDGET_RATIO);
  let estimate = estimateTokens(messages, tools);
  if (estimate <= budget) return messages;

  const toolIndices: Array<{ idx: number; len: number }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      toolIndices.push({ idx: i, len: msg.content.length });
    }
  }
  toolIndices.sort((a, b) => b.len - a.len);

  const trimmed = messages.map((m) => ({ ...m }));
  for (const { idx } of toolIndices) {
    if (estimate <= budget) break;
    const content = trimmed[idx].content;
    if (typeof content !== 'string') continue;

    const maxCharsPerTool = Math.max(
      MIN_TOOL_CONTENT_CHARS,
      Math.floor((budget * 3) / Math.max(toolIndices.length, 1)),
    );
    const keep = Math.min(
      Math.max(MIN_TOOL_CONTENT_CHARS, Math.floor(content.length * 0.05)),
      maxCharsPerTool,
    );
    const half = Math.floor(keep / 2);
    const head = content.slice(0, half);
    const tail = content.slice(-half);
    const dropped = content.length - keep;
    trimmed[idx].content =
      `${head}\n\n[... ${dropped} characters trimmed to fit ${limit} token context window ...]\n\n${tail}`;
    estimate = estimateTokens(trimmed, tools);
  }

  while (estimate > budget && trimmed.length > 4) {
    const dropIdx = trimmed.findIndex((m, i) => i >= 2 && m.role === 'tool');
    if (dropIdx === -1) break;
    if (dropIdx > 0 && trimmed[dropIdx - 1].role === 'assistant') {
      trimmed.splice(dropIdx - 1, 2);
    } else {
      trimmed.splice(dropIdx, 1);
    }
    estimate = estimateTokens(trimmed, tools);
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Model detection helpers
// ---------------------------------------------------------------------------

function defaultMaxOutputTokens(model: string): number {
  const m = model.toLowerCase();
  if (/claude.*(opus|sonnet)-?4/.test(m)) return 32_000;
  if (/claude/.test(m)) return 16_000;
  if (/gpt-5|^o[134]/.test(m)) return 32_000;
  if (/gpt-4/.test(m)) return 16_384;
  if (/gemini/.test(m)) return 65_536;
  if (/codex/.test(m)) return 32_000;
  return 16_384;
}

function isGeminiThinkingModel(model: string): boolean {
  return /gemini-(2\.5|3)/i.test(model);
}

// ---------------------------------------------------------------------------
// Tool schema cleaning
// ---------------------------------------------------------------------------

function cleanToolSchema(
  schema: unknown,
  isRoot = true,
): Record<string, unknown> | unknown {
  if (!schema || typeof schema !== 'object') {
    return isRoot ? { type: 'object', properties: {} } : schema;
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => cleanToolSchema(item, false));
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowed above
  const obj = schema as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') || key === 'strict' || key === 'const') continue;
    cleaned[key] = cleanToolSchema(value, false);
  }
  if (isRoot) {
    cleaned['type'] = 'object';
    const props = cleaned['properties'];
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      cleaned['properties'] = {};
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions types (subset)
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

interface OpenAIChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning?: string;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Translation: Gemini Content[] ↔ OpenAI messages
// ---------------------------------------------------------------------------

function geminiContentsToOpenAIMessages(
  contents: Content[],
  systemInstruction?: Content | Content[] | Part | Part[],
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  if (systemInstruction) {
    const sysText = extractText(systemInstruction);
    if (sysText) {
      messages.push({ role: 'system', content: sysText });
    }
  }

  for (const content of contents) {
    if (!content.parts) continue;
    const role = content.role ?? 'user';

    if (role === 'model') {
      const toolCalls: OpenAIToolCall[] = [];
      const textParts: string[] = [];

      for (const part of content.parts) {
        if (part.functionCall) {
          const id =
            part.functionCall.id ??
            `call_${Math.random().toString(36).slice(2, 10)}`;
          toolCalls.push({
            id,
            type: 'function',
            function: {
              name: part.functionCall.name ?? '',
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        } else if (part.text && !part.thought) {
          textParts.push(part.text);
        }
      }

      const msg: OpenAIMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('') : null,
      };
      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
      }
      messages.push(msg);
    } else if (role === 'user') {
      const funcResponses: Part[] = [];
      const textParts: string[] = [];

      for (const part of content.parts) {
        if (part.functionResponse) {
          funcResponses.push(part);
        } else if (part.text) {
          textParts.push(part.text);
        }
      }

      // Deduplicate by tool_call_id — some providers require exactly one
      // tool_result per tool_use. Keep last occurrence (most complete).
      const seenToolIds = new Map<string, Part>();
      for (let frIdx = 0; frIdx < funcResponses.length; frIdx++) {
        const fr = funcResponses[frIdx];
        // Use index-based fallback for responses missing an id to avoid
        // collapsing distinct responses into a single empty-string key.
         
        const frId = fr.functionResponse!.id || `_fr_${frIdx}`;
        seenToolIds.set(frId, fr);
      }
      for (const [frId, fr] of seenToolIds) {
        messages.push({
          role: 'tool',
          tool_call_id: frId,
          content:
            typeof fr.functionResponse!.response === 'object'
              ? JSON.stringify(fr.functionResponse!.response)
              : String(fr.functionResponse!.response ?? ''),
        });
      }

      if (textParts.length > 0) {
        messages.push({ role: 'user', content: textParts.join('') });
      }
    }
  }

  return messages;
}

function extractText(
  input: Content | Content[] | Part | Part[] | string | undefined,
): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    const texts: string[] = [];
    for (const item of input) {
      const t = extractText(item);
      if (t) texts.push(t);
    }
    return texts.join('\n') || undefined;
  }
  if ('parts' in input && input.parts) {
    return (
      input.parts
        .filter((p: Part) => p.text)
        .map((p: Part) => p.text!)
        .join('\n') || undefined
    );
  }
  if ('text' in input) return input.text || undefined;
  return undefined;
}

function geminiFunctionDeclsToOpenAITools(
  tools?: Array<{ functionDeclarations?: FunctionDeclaration[] }>,
): OpenAITool[] | undefined {
  if (!tools) return undefined;
  const result: OpenAITool[] = [];
  for (const toolGroup of tools) {
    if (!toolGroup.functionDeclarations) continue;
    for (const fd of toolGroup.functionDeclarations) {
      result.push({
        type: 'function',
        function: {
          name: fd.name ?? '',
          description: fd.description,
          parameters: cleanToolSchema(
            fd.parametersJsonSchema ?? fd.parameters ?? undefined,
          ),
        },
      });
    }
  }
  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Response conversion: OpenAI → Gemini format
// ---------------------------------------------------------------------------

function openAIResponseToGemini(
  completion: OpenAIChatCompletion,
): GeminiResponse {
  const choice = completion.choices?.[0];
  if (!choice) {
    const resp = new GenerateContentResponse();
    resp.candidates = [];
    return resp;
  }

  const parts: Part[] = [];
  if (choice.message.content) {
    parts.push({ text: choice.message.content });
  }
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = { _raw: tc.function.arguments };
      }
      parts.push({
        functionCall: { id: tc.id, name: tc.function.name, args },
      });
    }
  }

  const resp = new GenerateContentResponse();
  resp.candidates = [
    {
      content: { role: 'model', parts },
      finishReason: mapFinishReason(choice.finish_reason),
    },
  ];
  if (completion.usage) {
    resp.usageMetadata = {
      promptTokenCount: completion.usage.prompt_tokens,
      candidatesTokenCount: completion.usage.completion_tokens,
      totalTokenCount: completion.usage.total_tokens,
    };
  }
  return resp;
}

function mapFinishReason(reason: string | null): FinishReason | undefined {
  switch (reason) {
    case 'stop':
      return FinishReason.STOP;
    case 'length':
      return FinishReason.MAX_TOKENS;
    case 'content_filter':
      return FinishReason.SAFETY;
    case 'tool_calls':
      return FinishReason.STOP;
    default:
      return reason ? FinishReason.OTHER : undefined;
  }
}

// ---------------------------------------------------------------------------
// Streaming: parse OpenAI SSE → AsyncGenerator<GenerateContentResponse>
// ---------------------------------------------------------------------------

async function* parseOpenAIStream(
  response: Response,
): AsyncGenerator<GeminiResponse> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallAccum: Map<number, { id: string; name: string; args: string }> =
    new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        let chunk: OpenAIChatCompletionChunk;
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse
          chunk = JSON.parse(data) as OpenAIChatCompletionChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const parts: Part[] = [];

        if (choice.delta.content) {
          parts.push({ text: choice.delta.content });
        }

        const reasoning =
          choice.delta.reasoning ??
          (choice.delta.reasoning_content
            ? String(choice.delta.reasoning_content)
            : undefined);
        if (reasoning) {
          parts.push({ text: reasoning, thought: true });
        }

        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const existing = toolCallAccum.get(tc.index);
            if (!existing) {
              toolCallAccum.set(tc.index, {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                args: tc.function?.arguments ?? '',
              });
            } else {
              if (tc.function?.arguments) {
                existing.args += tc.function.arguments;
              }
            }
          }
        }

        if (choice.finish_reason && toolCallAccum.size > 0) {
          for (const [, tc] of toolCallAccum) {
            let args: Record<string, unknown> = {};
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse
              args = JSON.parse(tc.args) as Record<string, unknown>;
            } catch {
              args = { _raw: tc.args };
            }
            parts.push({
              functionCall: { id: tc.id, name: tc.name, args },
            });
          }
          toolCallAccum.clear();
        }

        if (parts.length === 0 && !choice.finish_reason) continue;

        const resp = new GenerateContentResponse();
        resp.candidates = [
          {
            content: { role: 'model', parts },
            finishReason: choice.finish_reason
              ? mapFinishReason(choice.finish_reason)
              : undefined,
          },
        ];
        if (chunk.usage) {
          resp.usageMetadata = {
            promptTokenCount: chunk.usage.prompt_tokens,
            candidatesTokenCount: chunk.usage.completion_tokens,
            totalTokenCount: chunk.usage.total_tokens,
          };
        }
        yield resp;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// OpenAIContentGenerator
// ---------------------------------------------------------------------------

export interface OpenAIContentGeneratorOptions {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(options: OpenAIContentGeneratorOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel ?? 'gpt-4o';
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GeminiResponse> {
    const body = this.buildRequestBody(request, false);
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.config?.abortSignal ?? undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- response.json()
    const completion = (await response.json()) as OpenAIChatCompletion;
    return openAIResponseToGemini(completion);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GeminiResponse>> {
    const body = this.buildRequestBody(request, true);
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.config?.abortSignal ?? undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    return parseOpenAIStream(response);
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    let totalChars = 0;
    if (request.contents) {
      totalChars += JSON.stringify(request.contents).length;
    }
    const totalTokens = Math.ceil(totalChars / 4);
    return { totalTokens };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'embedContent is not supported via OpenAI-compatible endpoints. ' +
        'Use a dedicated embedding API instead.',
    );
  }

  private buildRequestBody(
    request: GenerateContentParameters,
    stream: boolean,
  ): Record<string, unknown> {
    const model = request.model || this.defaultModel;

    let contents: Content[];
    const rawContents = request.contents;
    if (typeof rawContents === 'string') {
      contents = [{ role: 'user', parts: [{ text: rawContents }] }];
    } else if (Array.isArray(rawContents)) {
      const first: unknown = rawContents[0];
      const isContentArray =
        rawContents.length > 0 &&
        first !== null &&
        first !== undefined &&
        !Array.isArray(first) &&
        typeof first === 'object' &&
        'role' in first;
      if (isContentArray) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- guarded by runtime checks above
        contents = rawContents as unknown as Content[];
      } else {
        const parts: Part[] = [];
        for (const item of rawContents) {
          const entry: unknown = item;
          if (
            entry !== null &&
            entry !== undefined &&
            typeof entry === 'object' &&
            'text' in entry
          ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- guarded by runtime checks
            parts.push(entry as Part);
          }
        }
        contents = [{ role: 'user', parts }];
      }
    } else {
      if (
        typeof rawContents === 'object' &&
        rawContents !== null &&
        'role' in rawContents
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- guarded
        contents = [rawContents as unknown as Content];
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- fallback
        contents = [{ role: 'user', parts: [rawContents as unknown as Part] }];
      }
    }

    const sysInstruction = request.config?.systemInstruction;
    let sysContent: Content | Content[] | Part | Part[] | undefined;
    if (typeof sysInstruction === 'string') {
      sysContent = { role: 'user', parts: [{ text: sysInstruction }] };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- SDK type boundary
      sysContent = sysInstruction as unknown as
        | Content
        | Content[]
        | Part
        | Part[]
        | undefined;
    }

    const messages = geminiContentsToOpenAIMessages(contents, sysContent);
    const tools = geminiFunctionDeclsToOpenAITools(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- SDK type boundary
      request.config?.tools as unknown as Array<{
        functionDeclarations?: FunctionDeclaration[];
      }>,
    );

    const body: Record<string, unknown> = { model, messages, stream };

    if (tools) body['tools'] = tools;

    const isClaude = /claude/i.test(model);
    if (request.config?.temperature !== undefined)
      body['temperature'] = request.config.temperature;
    if (
      request.config?.topP !== undefined &&
      !(isClaude && body['temperature'] !== undefined)
    )
      body['top_p'] = request.config.topP;

    body['max_tokens'] =
      request.config?.maxOutputTokens ?? defaultMaxOutputTokens(model);

    if (request.config?.stopSequences)
      body['stop'] = request.config.stopSequences;
    if (request.config?.presencePenalty !== undefined)
      body['presence_penalty'] = request.config.presencePenalty;
    if (request.config?.frequencyPenalty !== undefined)
      body['frequency_penalty'] = request.config.frequencyPenalty;
    if (request.config?.seed !== undefined) body['seed'] = request.config.seed;

    if (stream) {
      body['stream_options'] = { include_usage: true };
    }

    body['messages'] = trimMessagesForContextBudget(messages, tools, model);

    if (isGeminiThinkingModel(model)) {
      body['reasoning_effort'] = 'high';
    }

    return body;
  }
}
