/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  FinishReason,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type GenerateContentParameters,
  type Content,
  type Part,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import {
  restoreRedactedSecrets,
  sanitizeModelContentWithPresidio,
  sanitizeModelDataWithPresidio,
  StreamingRedactionRestorer,
  type PresidioSanitizationOptions,
} from '../utils/agent-sanitization-utils.js';

interface OpenAIMessage {
  role: string;
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage?: OpenAIUsage;
}

interface OpenAIDelta {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface OpenAIChatChunk {
  choices: Array<{
    delta: OpenAIDelta;
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage;
}

const REDACTION_TOKEN_SYSTEM_INSTRUCTION = `Redaction tokens such as [REDACTED:uuid] are opaque references to sensitive values held by the local tool executor. You cannot and must not reveal, infer, or alter their underlying values. When the user requests an authorized operation involving one, copy the complete token unchanged into the appropriate tool argument. The local executor restores the value immediately before tool execution, so do not refuse an operation solely because its input is redacted. Never reproduce a token in ordinary assistant text unless needed to explain an error.`;

async function toOpenAIMessages(
  request: GenerateContentParameters,
  presidioOptions: PresidioSanitizationOptions,
): Promise<OpenAIMessage[]> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: REDACTION_TOKEN_SYSTEM_INSTRUCTION },
  ];

  if (request.config?.systemInstruction) {
    const si = request.config.systemInstruction;
    let text = '';
    if (typeof si === 'string') {
      text = si;
    } else if (
      typeof si === 'object' &&
      'parts' in si &&
      Array.isArray(si.parts)
    ) {
      text = si.parts
        .filter((p: Part) => typeof p.text === 'string')
        .map((p: Part) => (typeof p.text === 'string' ? p.text : ''))
        .join('\n');
    }
    if (text) {
      messages.push({
        role: 'system',
        content: await sanitizeModelContentWithPresidio(text, presidioOptions),
      });
    }
  }

  let contents: Content[] = [];
  if (typeof request.contents === 'string') {
    contents = [{ role: 'user', parts: [{ text: request.contents }] }];
  } else if (Array.isArray(request.contents)) {
    contents = request.contents.map((item) => {
      if (typeof item === 'string') {
        return { role: 'user', parts: [{ text: item }] } satisfies Content;
      }
      if (typeof item === 'object' && item !== null && 'role' in item) {
        const c: Content = { role: String(item.role) };
        if ('parts' in item && Array.isArray(item.parts)) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          c.parts = item.parts as unknown as Part[];
        }
        return c;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const partItem: Part = item as unknown as Part;
      return {
        role: 'user',
        parts: [partItem],
      } satisfies Content;
    });
  } else if (
    request.contents !== null &&
    typeof request.contents === 'object' &&
    'role' in request.contents
  ) {
    const rc = request.contents;
    const c: Content = { role: String(rc.role) };
    if ('parts' in rc && Array.isArray(rc.parts)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      c.parts = rc.parts as unknown as Part[];
    }
    contents = [c];
  }

  for (const content of contents) {
    const role = content.role === 'model' ? 'assistant' : 'user';
    const parts = content.parts || [];

    const textParts = parts.filter(
      (p) => typeof p.text === 'string' && p.thought !== true,
    );
    const funcCallParts = parts.filter(
      (p) => p.functionCall !== undefined && p.thought !== true,
    );
    const funcResponseParts = parts.filter(
      (p) => p.functionResponse !== undefined,
    );

    if (funcResponseParts.length > 0) {
      for (const part of funcResponseParts) {
        const fr = part.functionResponse!;
        messages.push({
          role: 'tool',
          tool_call_id: fr.id ?? fr.name ?? 'unknown',
          content: await sanitizeModelContentWithPresidio(
            JSON.stringify(fr.response ?? {}),
            presidioOptions,
          ),
        });
      }
      continue;
    }

    if (funcCallParts.length > 0) {
      const toolCalls: OpenAIToolCall[] = [];
      for (const [idx, part] of funcCallParts.entries()) {
        const fc = part.functionCall!;
        toolCalls.push({
          id: fc.id ?? `call_${fc.name}_${idx}`,
          type: 'function',
          function: {
            name: fc.name ?? '',
            arguments: JSON.stringify(
              await sanitizeModelDataWithPresidio(
                fc.args ?? {},
                presidioOptions,
              ),
            ),
          },
        });
      }
      const mixedText = textParts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('\n');
      messages.push({
        role: 'assistant',
        content: mixedText
          ? await sanitizeModelContentWithPresidio(mixedText, presidioOptions)
          : null,
        tool_calls: toolCalls,
      });
      continue;
    }

    const text = textParts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('\n');

    messages.push({
      role,
      content: await sanitizeModelContentWithPresidio(text, presidioOptions),
    });
  }

  return messages;
}

function toOpenAITools(request: GenerateContentParameters):
  | Array<{
      type: 'function';
      function: { name: string; description?: string; parameters?: unknown };
    }>
  | undefined {
  if (!request.config?.tools || request.config.tools.length === 0) {
    return undefined;
  }
  const tools: Array<{
    type: 'function';
    function: { name: string; description?: string; parameters?: unknown };
  }> = [];
  for (const tool of request.config.tools) {
    if (
      typeof tool === 'object' &&
      tool !== null &&
      'functionDeclarations' in tool &&
      Array.isArray(tool.functionDeclarations)
    ) {
      for (const fd of tool.functionDeclarations) {
        tools.push({
          type: 'function',
          function: {
            name: fd.name ?? '',
            description: fd.description,
            parameters:
              'parametersJsonSchema' in fd
                ? fd.parametersJsonSchema
                : fd.parameters,
          },
        });
      }
    }
  }
  return tools.length > 0 ? tools : undefined;
}

async function buildRequestBody(
  request: GenerateContentParameters,
  model: string | undefined,
  stream: boolean,
  presidioOptions: PresidioSanitizationOptions,
): Promise<Record<string, unknown>> {
  const messages = await toOpenAIMessages(request, presidioOptions);
  const tools = toOpenAITools(request);

  const body: Record<string, unknown> = {
    model: model ?? request.model ?? 'gpt-4',
    messages,
    stream,
  };

  if (stream) {
    body['stream_options'] = { include_usage: true };
  }

  const gc = request.config;
  if (gc) {
    if (gc.temperature !== undefined) body['temperature'] = gc.temperature;
    if (gc.topP !== undefined) body['top_p'] = gc.topP;
    if (gc.maxOutputTokens !== undefined)
      body['max_tokens'] = gc.maxOutputTokens;
    if (gc.stopSequences && gc.stopSequences.length > 0)
      body['stop'] = gc.stopSequences;
  }

  if (tools) body['tools'] = tools;

  return body;
}

function mapFinishReason(fr: string | null | undefined): FinishReason {
  if (fr === 'stop' || fr === 'tool_calls') return FinishReason.STOP;
  if (fr === 'length') return FinishReason.MAX_TOKENS;
  if (fr === 'content_filter') return FinishReason.SAFETY;
  return FinishReason.OTHER;
}

function buildResponseFromOpenAI(
  data: OpenAIChatResponse,
): GenerateContentResponse {
  const choice = data.choices[0];
  const parts: Part[] = [];

  if (choice.message.content) {
    parts.push({ text: restoreRedactedSecrets(choice.message.content) });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      parts.push({
        functionCall: {
          id: tc.id,
          name: tc.function.name,
          args,
        },
      });
    }
  }

  const response = new GenerateContentResponse();
  response.candidates = [
    {
      index: 0,
      content: { role: 'model', parts },
      finishReason: mapFinishReason(choice.finish_reason),
    },
  ];

  if (data.usage) {
    response.usageMetadata = {
      promptTokenCount: data.usage.prompt_tokens,
      candidatesTokenCount: data.usage.completion_tokens,
      totalTokenCount: data.usage.total_tokens,
    };
  }

  return response;
}

export class OpenAIContentGenerator implements ContentGenerator {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      model?: string;
      headers?: Record<string, string>;
      presidio?: PresidioSanitizationOptions;
    },
  ) {}

  private get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    };
    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const body = await buildRequestBody(
      request,
      this.options.model,
      false,
      this.options.presidio ?? {},
    );
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `OpenAI-compatible API error: ${resp.status} ${resp.statusText} - ${text}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const data = (await resp.json()) as OpenAIChatResponse;
    return buildResponseFromOpenAI(data);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const body = await buildRequestBody(
      request,
      this.options.model,
      true,
      this.options.presidio ?? {},
    );
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `OpenAI-compatible API error: ${resp.status} ${resp.statusText} - ${text}`,
      );
    }

    const body2 = resp.body;
    if (!body2) {
      throw new Error('OpenAI-compatible API returned no response body');
    }

    return this._parseSSEStream(body2);
  }

  private async *_parseSSEStream(
    stream: ReadableStream<Uint8Array>,
  ): AsyncGenerator<GenerateContentResponse> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const redactionRestorer = new StreamingRedactionRestorer();

    const accumulatedToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let pendingFinishReason: string | null = null;
    let finishReasonDelivered = false;
    let usageMetadata: GenerateContentResponse['usageMetadata'] | undefined =
      undefined;

    function* flushPending(): Generator<GenerateContentResponse> {
      if (finishReasonDelivered) return;
      if (accumulatedToolCalls.size > 0) {
        const parts: Part[] = [];
        for (const [, tc] of accumulatedToolCalls) {
          let args: Record<string, unknown> = {};
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            args = JSON.parse(tc.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          parts.push({ functionCall: { id: tc.id, name: tc.name, args } });
        }
        const finalResponse = new GenerateContentResponse();
        finalResponse.candidates = [
          {
            index: 0,
            content: { role: 'model', parts },
            finishReason: mapFinishReason(pendingFinishReason),
          },
        ];
        if (usageMetadata) {
          finalResponse.usageMetadata = usageMetadata;
        }
        yield finalResponse;
      } else if (pendingFinishReason !== null) {
        const finalResponse = new GenerateContentResponse();
        finalResponse.candidates = [
          {
            index: 0,
            content: { role: 'model', parts: [] },
            finishReason: mapFinishReason(pendingFinishReason),
          },
        ];
        if (usageMetadata) {
          finalResponse.usageMetadata = usageMetadata;
        }
        yield finalResponse;
      }
    }

    function createTextResponse(
      text: string,
      finishReason?: FinishReason,
    ): GenerateContentResponse {
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          index: 0,
          content: { role: 'model', parts: [{ text }] },
          finishReason,
        },
      ];
      if (usageMetadata) response.usageMetadata = usageMetadata;
      return response;
    }

    function* flushRestoredText(): Generator<GenerateContentResponse> {
      const text = redactionRestorer.flush();
      if (!text) return;
      const finishReason = pendingFinishReason
        ? mapFinishReason(pendingFinishReason)
        : undefined;
      if (finishReason !== undefined) finishReasonDelivered = true;
      yield createTextResponse(text, finishReason);
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          yield* flushRestoredText();
          yield* flushPending();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield* flushRestoredText();
            yield* flushPending();
            return;
          }

          let chunk: OpenAIChatChunk;
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            chunk = JSON.parse(data) as OpenAIChatChunk;
          } catch {
            continue;
          }

          if (chunk.usage) {
            usageMetadata = {
              promptTokenCount: chunk.usage.prompt_tokens,
              candidatesTokenCount: chunk.usage.completion_tokens,
              totalTokenCount: chunk.usage.total_tokens,
            };
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.finish_reason) {
            pendingFinishReason = choice.finish_reason;
          }

          const delta = choice.delta;

          if (delta.tool_calls) {
            for (const tcDelta of delta.tool_calls) {
              const existing = accumulatedToolCalls.get(tcDelta.index);
              if (!existing) {
                accumulatedToolCalls.set(tcDelta.index, {
                  id: tcDelta.id ?? `call_${tcDelta.index}`,
                  name: tcDelta.function?.name ?? '',
                  arguments: tcDelta.function?.arguments ?? '',
                });
              } else {
                if (tcDelta.function?.arguments) {
                  existing.arguments += tcDelta.function.arguments;
                }
                if (tcDelta.function?.name && !existing.name) {
                  existing.name = tcDelta.function.name;
                }
              }
            }
            continue;
          }

          if (delta.content) {
            const restoredContent = redactionRestorer.push(delta.content);
            const mappedFinish =
              choice.finish_reason && !redactionRestorer.hasPending()
                ? mapFinishReason(choice.finish_reason)
                : undefined;
            if (mappedFinish !== undefined) {
              finishReasonDelivered = true;
            }
            if (restoredContent) {
              yield createTextResponse(restoredContent, mappedFinish);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    let parts: Part[] = [];
    if (Array.isArray(request.contents)) {
      for (const item of request.contents) {
        if (typeof item === 'string') {
          parts.push({ text: item });
        } else if (
          typeof item === 'object' &&
          item !== null &&
          'parts' in item
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const withParts = item as unknown as { parts: unknown };
          if (Array.isArray(withParts.parts)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            parts = parts.concat(withParts.parts as unknown as Part[]);
          }
        } else if (typeof item === 'object' && item !== null) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          parts.push(item as unknown as Part);
        }
      }
    } else if (typeof request.contents === 'string') {
      parts = [{ text: request.contents }];
    }
    const totalTokens = estimateTokenCountSync(parts);
    return { totalTokens };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'embedContent is not supported by the OpenAI-compatible provider',
    );
  }
}
