/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  FunctionCallingConfigMode,
  GenerateContentConfig,
  GenerateContentParameters,
  Part,
  PartListUnion,
} from '@google/genai';
import { GenerateContentResponse, FinishReason } from '@google/genai';

export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>
    | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAiRequest {
  model: string;
  messages: OpenAiMessage[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  tools?: OpenAiTool[];
  tool_choice?: 'auto' | 'required' | 'none';
  response_format?: {
    type: string;
    json_schema?: { name: string; schema: Record<string, unknown> };
  };
}

export interface OpenAiResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAiStreamChunk {
  id?: string;
  model?: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
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
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamAccumulator {
  textContent: string;
  reasoningContent: string;
  finishReason: string | null;
  toolCallDeltas: Map<number, { id: string; name: string; arguments: string }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

export function createStreamAccumulator(): StreamAccumulator {
  return {
    textContent: '',
    reasoningContent: '',
    finishReason: null,
    toolCallDeltas: new Map(),
    usage: null,
  };
}

export type GeminiToOpenAiOptions = {
  stream?: boolean;
};

function isPartObject(p: unknown): p is Part {
  return typeof p === 'object' && p !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSchemaType(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value.toLowerCase();
}

function normalizeOpenAiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOpenAiSchema(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (key === '$schema') {
      continue;
    }

    if (key === 'type') {
      normalized['type'] = normalizeSchemaType(rawValue);
      continue;
    }

    if (key === 'properties') {
      normalized['properties'] = isRecord(rawValue)
        ? Object.fromEntries(
            Object.entries(rawValue).map(([propertyName, propertySchema]) => [
              propertyName,
              isRecord(propertySchema)
                ? normalizeOpenAiSchema(propertySchema)
                : {},
            ]),
          )
        : {};
      continue;
    }

    if (key === 'items') {
      normalized['items'] =
        isRecord(rawValue) || Array.isArray(rawValue)
          ? normalizeOpenAiSchema(rawValue)
          : {};
      continue;
    }

    if (key === 'additionalProperties') {
      normalized['additionalProperties'] =
        typeof rawValue === 'boolean'
          ? rawValue
          : isRecord(rawValue)
            ? normalizeOpenAiSchema(rawValue)
            : true;
      continue;
    }

    if (key === 'required') {
      normalized['required'] = Array.isArray(rawValue)
        ? rawValue.filter((item): item is string => typeof item === 'string')
        : [];
      continue;
    }

    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      normalized[key] = Array.isArray(rawValue)
        ? rawValue.map((entry) => normalizeOpenAiSchema(entry))
        : [];
      continue;
    }

    normalized[key] = normalizeOpenAiSchema(rawValue);
  }

  if ('properties' in normalized) {
    normalized['type'] = 'object';
  }

  if (normalized['type'] === 'object' && !('properties' in normalized)) {
    normalized['properties'] = {};
  }

  return normalized;
}

function getFunctionParametersSchema(declaration: {
  parameters?: unknown;
  parametersJsonSchema?: unknown;
}): Record<string, unknown> {
  const rawSchema = isRecord(declaration['parametersJsonSchema'])
    ? declaration['parametersJsonSchema']
    : isRecord(declaration['parameters'])
      ? declaration['parameters']
      : {};

  const normalized = normalizeOpenAiSchema(rawSchema);
  if (isRecord(normalized)) {
    return normalized;
  }

  return {
    type: 'object',
    properties: {},
  };
}

function isContent(obj: unknown): obj is Content {
  return (
    typeof obj === 'object' && obj !== null && 'role' in obj && 'parts' in obj
  );
}

function systemInstructionToString(
  config?: GenerateContentConfig,
): string | undefined {
  if (!config?.systemInstruction) return undefined;
  const si = config.systemInstruction;
  if (typeof si === 'string') return si;
  if (isPartObject(si)) {
    if (isContent(si)) {
      const contentParts = Array.isArray(si.parts) ? si.parts : [];
      if (contentParts.length > 0) {
        return (
          contentParts
            .filter(
              (p) => !(typeof p === 'string') && isPartObject(p) && !!p.text,
            )
            .map((p) => (!(typeof p === 'string') ? (p.text ?? '') : ''))
            .join('\n') || undefined
        );
      }
    }
    if (si.text) return si.text;
  }
  return undefined;
}

function normalizeParts(parts: PartListUnion | undefined): Part[] {
  if (!parts) return [];
  if (!Array.isArray(parts)) {
    if (typeof parts === 'string') return [{ text: parts }];
    return [parts];
  }
  return parts.map((p) => {
    if (typeof p === 'string') return { text: p };
    return p;
  });
}

function contentToMessages(contents: Content[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [];

  for (const content of contents) {
    const parts = normalizeParts(content.parts);

    const textParts = parts.filter(
      (p) => p.text && !p.thought && !p.functionCall && !p.functionResponse,
    );
    const imageParts = parts.filter((p) => p.inlineData);
    const thoughtParts = parts.filter((p) => p.thought && p.text);
    const functionCallParts = parts.filter((p) => p.functionCall);
    const functionResponseParts = parts.filter((p) => p.functionResponse);

    if (content.role === 'user') {
      if (functionResponseParts.length > 0) {
        for (const part of functionResponseParts) {
          const fr = part.functionResponse!;
          messages.push({
            role: 'tool',
            tool_call_id: fr.id ?? '',
            content: JSON.stringify(fr.response ?? {}),
          });
        }
      } else if (imageParts.length > 0) {
        const contentParts: Array<{
          type: string;
          text?: string;
          image_url?: { url: string };
        }> = [];
        for (const part of textParts) {
          if (part.text) {
            contentParts.push({ type: 'text', text: part.text });
          }
        }
        for (const part of imageParts) {
          if (part.inlineData) {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
              },
            });
          }
        }
        messages.push({
          role: 'user',
          content: contentParts.length > 0 ? contentParts : null,
        });
      } else {
        const texts = textParts.map((p) => p.text!).filter(Boolean);
        const thoughtTexts = thoughtParts.map((p) => p.text!).filter(Boolean);
        const allText = [...texts, ...thoughtTexts].join('\n');
        messages.push({ role: 'user', content: allText || null });
      }
    } else if (content.role === 'model') {
      const message: OpenAiMessage = {
        role: 'assistant',
        content: null,
      };

      const textContent = textParts.map((p) => p.text!).filter(Boolean);
      const thoughtContent = thoughtParts.map((p) => p.text!).filter(Boolean);
      const combinedText = [...textContent, ...thoughtContent].join('\n');

      if (combinedText) {
        message.content = combinedText;
      }

      if (functionCallParts.length > 0) {
        message.tool_calls = functionCallParts.map((part) => {
          const fc = part.functionCall!;
          return {
            id: fc.id ?? `call_${fc.name}_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: fc.name ?? '',
              arguments: JSON.stringify(fc.args ?? {}),
            },
          };
        });
        message.content = message.content || null;
      }

      messages.push(message);
    }
  }

  return messages;
}

function toolsToOpenAi(
  config?: GenerateContentConfig,
): OpenAiTool[] | undefined {
  if (!config?.tools || config.tools.length === 0) return undefined;
  const openAiTools: OpenAiTool[] = [];
  for (const tool of config.tools) {
    if ('functionDeclarations' in tool && tool.functionDeclarations) {
      for (const fd of tool.functionDeclarations) {
        openAiTools.push({
          type: 'function',
          function: {
            name: fd.name ?? '',
            description: fd.description ?? '',
            parameters: getFunctionParametersSchema(fd),
          },
        });
      }
    }
  }
  return openAiTools.length > 0 ? openAiTools : undefined;
}

function toolChoiceToOpenAi(
  config?: GenerateContentConfig,
): 'auto' | 'required' | 'none' | undefined {
  if (!config?.toolConfig) return undefined;
  const tc = config.toolConfig;
  if (!tc.functionCallingConfig) return undefined;
  const mode: FunctionCallingConfigMode | undefined =
    tc.functionCallingConfig.mode;
  if (!mode) return undefined;
  switch (mode) {
    case 'AUTO':
      return 'auto';
    case 'ANY':
      return 'required';
    case 'NONE':
      return 'none';
    default:
      return undefined;
  }
}

export function geminiToOpenAiRequest(
  params: GenerateContentParameters,
  options: GeminiToOpenAiOptions = {},
): OpenAiRequest {
  const config = params.config;
  const systemStr = systemInstructionToString(config);

  const messages: OpenAiMessage[] = [];
  if (systemStr) {
    messages.push({ role: 'system', content: systemStr });
  }

  const contents: Content[] = (() => {
    const raw: unknown = params.contents;
    if (Array.isArray(raw)) {
      return (raw as unknown[]).map((item): Content => {
        if (typeof item === 'string') {
          return { role: 'user', parts: [{ text: item }] };
        }
        if (isContent(item)) {
          return item;
        }
        return { role: 'user', parts: [{ text: String(item) }] };
      });
    }
    if (typeof raw === 'string') {
      return [{ role: 'user', parts: [{ text: raw }] }];
    }
    if (isContent(raw)) {
      return [raw];
    }
    return [{ role: 'user', parts: [{ text: String(raw) }] }];
  })();
  messages.push(...contentToMessages(contents));

  const request: OpenAiRequest = {
    model: params.model,
    messages,
  };

  if (options.stream) {
    request.stream = true;
    request.stream_options = { include_usage: true };
  }

  if (config?.temperature !== undefined)
    request.temperature = config.temperature;
  if (config?.topP !== undefined) request.top_p = config.topP;
  if (config?.maxOutputTokens !== undefined)
    request.max_tokens = config.maxOutputTokens;
  if (config?.stopSequences?.length) request.stop = config.stopSequences;

  request.tools = toolsToOpenAi(config);
  request.tool_choice = toolChoiceToOpenAi(config);

  if (config?.responseMimeType === 'application/json') {
    if (config.responseJsonSchema && isRecord(config.responseJsonSchema)) {
      request.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: config.responseJsonSchema,
        },
      };
    } else {
      request.response_format = { type: 'json_object' };
    }
  }

  return request;
}

function finishReasonToGemini(reason: string): FinishReason {
  switch (reason) {
    case 'stop':
    case 'tool_calls':
      return FinishReason.STOP;
    case 'length':
      return FinishReason.MAX_TOKENS;
    default:
      return FinishReason.STOP;
  }
}

export function openAiToGeminiResponse(
  openAiResp: OpenAiResponse,
  model: string,
): GenerateContentResponse {
  const choice = openAiResp.choices?.[0];
  const message = choice?.message;
  const parts: Part[] = [];

  if (message?.reasoning_content) {
    parts.push({
      text: message.reasoning_content,
      thought: true,
    });
  }

  if (message?.content) {
    parts.push({ text: message.content });
  }

  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      const fn = tc.function;
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(fn?.arguments || '{}');
        if (isRecord(parsed)) {
          args = parsed;
        }
      } catch {
        args = {};
      }
      parts.push({
        functionCall: {
          id: tc.id || '',
          name: fn?.name || '',
          args,
        },
      });
    }
  }

  const finishReason = finishReasonToGemini(choice?.finish_reason || 'stop');

  const out = Object.assign(new GenerateContentResponse(), {
    candidates: [
      {
        content: {
          role: 'model',
          parts: parts.length > 0 ? parts : [{ text: '' }],
        },
        finishReason,
      },
    ],
    modelVersion: openAiResp.model || model,
    responseId: openAiResp.id,
    ...(openAiResp.usage
      ? {
          usageMetadata: {
            promptTokenCount: openAiResp.usage.prompt_tokens,
            candidatesTokenCount: openAiResp.usage.completion_tokens,
            totalTokenCount: openAiResp.usage.total_tokens,
          },
        }
      : {}),
  });
  return out;
}

export function openAiChunkToGeminiChunk(
  chunk: OpenAiStreamChunk,
  model: string,
  accumulator: StreamAccumulator,
): GenerateContentResponse | null {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;

  if (delta?.reasoning_content) {
    accumulator.reasoningContent += delta.reasoning_content;
  }

  if (delta?.content) {
    accumulator.textContent += delta.content;
  }

  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const existing = accumulator.toolCallDeltas.get(tc.index) ?? {
        id: '',
        name: '',
        arguments: '',
      };
      if (tc.id) existing.id = tc.id;
      if (tc.function?.name) existing.name += tc.function.name;
      if (tc.function?.arguments) existing.arguments += tc.function.arguments;
      accumulator.toolCallDeltas.set(tc.index, existing);
    }
  }

  if (choice?.finish_reason) {
    accumulator.finishReason = choice.finish_reason;
  }

  if (chunk.usage) {
    accumulator.usage = {
      promptTokens: chunk.usage.prompt_tokens,
      completionTokens: chunk.usage.completion_tokens,
      totalTokens: chunk.usage.total_tokens,
    };
  }

  if (
    accumulator.finishReason &&
    !delta?.content &&
    !delta?.reasoning_content &&
    !delta?.tool_calls
  ) {
    const parts: Part[] = [];

    if (accumulator.reasoningContent) {
      parts.push({
        text: accumulator.reasoningContent,
        thought: true,
      });
    }

    if (accumulator.textContent) {
      parts.push({ text: accumulator.textContent });
    }

    if (accumulator.toolCallDeltas.size > 0) {
      for (const [, tc] of accumulator.toolCallDeltas) {
        let args: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(tc.arguments || '{}');
          if (isRecord(parsed)) {
            args = parsed;
          }
        } catch {
          args = {};
        }
        parts.push({
          functionCall: {
            id: tc.id || '',
            name: tc.name,
            args,
          },
        });
      }
    }

    const finishReason = finishReasonToGemini(accumulator.finishReason);

    const finalOut = Object.assign(new GenerateContentResponse(), {
      candidates: [
        {
          content: {
            role: 'model',
            parts: parts.length > 0 ? parts : [{ text: '' }],
          },
          finishReason,
        },
      ],
      modelVersion: chunk.model || model,
      responseId: chunk.id,
      ...(accumulator.usage
        ? {
            usageMetadata: {
              promptTokenCount: accumulator.usage.promptTokens,
              candidatesTokenCount: accumulator.usage.completionTokens,
              totalTokenCount: accumulator.usage.totalTokens,
            },
          }
        : {}),
    });
    return finalOut;
  }

  const deltaParts: Part[] = [];

  if (delta?.reasoning_content) {
    deltaParts.push({ text: delta.reasoning_content, thought: true });
  }

  if (delta?.content) {
    deltaParts.push({ text: delta.content });
  }

  if (deltaParts.length > 0) {
    const deltaOut = Object.assign(new GenerateContentResponse(), {
      candidates: [
        {
          content: {
            role: 'model',
            parts: deltaParts,
          },
        },
      ],
      modelVersion: chunk.model || model,
      responseId: chunk.id,
    });
    return deltaOut;
  }

  return null;
}

export interface OpenAiErrorDetail {
  message?: string;
  type?: string;
}

export interface OpenAiErrorResponse {
  error?: OpenAiErrorDetail;
}

export function isOpenAiErrorResponse(
  value: unknown,
): value is OpenAiErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value;
}
