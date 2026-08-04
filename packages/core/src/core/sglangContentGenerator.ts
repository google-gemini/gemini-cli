/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/types.js';

function cleanSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map(cleanSchema);
  }
  const obj = { ...(schema as Record<string, unknown>) };
  if (typeof obj['type'] === 'string') {
    obj['type'] = obj['type'].toLowerCase();
  }
  if (obj['properties'] && typeof obj['properties'] === 'object') {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(
      obj['properties'] as Record<string, unknown>,
    )) {
      props[k] = cleanSchema(v);
    }
    obj['properties'] = props;
  }
  if (obj['items']) {
    obj['items'] = cleanSchema(obj['items']);
  }
  return obj;
}

export class SglangContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl: string = 'http://127.0.0.1:30100/v1',
    defaultModel: string = 'moonshotai/Kimi-K3',
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
  }

  private convertContentsToMessages(
    contents: Content[] | string | undefined,
    systemInstruction?: Content | string,
  ) {
    const messages: Array<{
      role: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }> = [];

    if (systemInstruction) {
      const text =
        typeof systemInstruction === 'string'
          ? systemInstruction
          : systemInstruction.parts
              ?.map((p: Part) => p.text)
              .filter(Boolean)
              .join('\n') || '';
      if (text) {
        messages.push({ role: 'system', content: text });
      }
    }

    if (typeof contents === 'string') {
      messages.push({ role: 'user', content: contents });
      return messages;
    }

    if (Array.isArray(contents)) {
      for (const c of contents) {
        if (!c || !c.parts) continue;
        const role = c.role === 'model' ? 'assistant' : 'user';

        let textParts = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of c.parts) {
          if (part.text) {
            textParts += (textParts ? '\n' : '') + part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `call_${Math.random().toString(36).substring(2, 9)}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              },
            });
          }
          if (part.functionResponse) {
            messages.push({
              role: 'tool',
              content: JSON.stringify(part.functionResponse.response || {}),
              tool_call_id:
                (part.functionResponse as { id?: string }).id ||
                `call_${part.functionResponse.name}`,
            });
          }
        }

        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: textParts || null,
            tool_calls: toolCalls,
          });
        } else if (textParts) {
          messages.push({ role, content: textParts });
        }
      }
    }

    if (messages.length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    return messages;
  }

  private convertTools(toolsConfig?: GenerateContentParameters['config']) {
    if (!toolsConfig?.tools || !Array.isArray(toolsConfig.tools)) {
      return undefined;
    }
    const tools: Array<{
      type: 'function';
      function: {
        name: string;
        description?: string;
        parameters?: unknown;
      };
    }> = [];

    for (const t of toolsConfig.tools) {
      const functionDeclarations = (
        t as {
          functionDeclarations?: Array<{
            name: string;
            description?: string;
            parameters?: unknown;
          }>;
        }
      ).functionDeclarations;
      if (Array.isArray(functionDeclarations)) {
        for (const fd of functionDeclarations) {
          tools.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description,
              parameters: cleanSchema(fd.parameters),
            },
          });
        }
      }
    }
    return tools.length > 0 ? tools : undefined;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertContentsToMessages(
      request.contents as Content[] | string,
      request.config?.systemInstruction as Content | string,
    );
    const tools = this.convertTools(request.config);

    const payload: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages,
      temperature: request.config?.temperature ?? 0.7,
      max_tokens: request.config?.maxOutputTokens ?? 4096,
      stream: false,
    };
    if (tools && tools.length > 0) {
      payload['tools'] = tools;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = `Failed to reach SGLang server at ${this.baseUrl}/chat/completions. Is kubectl port-forward running? (${err instanceof Error ? err.message : String(err)})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`SGLang HTTP error ${res.status}:`, errText);
      throw new Error(`SGLang server error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const parts: Part[] = [];

    if (message?.reasoning_content) {
      parts.push({ text: message.reasoning_content });
    }
    if (message?.content) {
      parts.push({ text: message.content });
    }

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          // ignore parse error
        }
        parts.push({
          functionCall: {
            name: tc.function?.name,
            args,
          },
        });
      }
    }

    return {
      candidates: [
        {
          content: { parts, role: 'model' },
          finishReason: choice?.finish_reason === 'stop' ? 'STOP' : 'MAX_TOKENS',
        },
      ],
      usageMetadata: {
        promptTokenCount: data.usage?.prompt_tokens ?? 0,
        candidatesTokenCount: data.usage?.completion_tokens ?? 0,
        totalTokenCount: data.usage?.total_tokens ?? 0,
      },
    } as GenerateContentResponse;
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): AsyncGenerator<GenerateContentResponse> {
    const messages = this.convertContentsToMessages(
      request.contents as Content[] | string,
      request.config?.systemInstruction as Content | string,
    );
    const tools = this.convertTools(request.config);

    const payload: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages,
      temperature: request.config?.temperature ?? 0.7,
      max_tokens: request.config?.maxOutputTokens ?? 4096,
      stream: true,
    };
    if (tools && tools.length > 0) {
      payload['tools'] = tools;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = `Failed to reach SGLang server at ${this.baseUrl}/chat/completions. Is kubectl port-forward running? (${err instanceof Error ? err.message : String(err)})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!res.ok || !res.body) {
      const errText = await res.text();
      console.error(`SGLang HTTP stream error ${res.status}:`, errText);
      throw new Error(`SGLang stream error (${res.status}): ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') return;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const textChunk = delta?.content || delta?.reasoning_content || '';
          if (textChunk) {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: textChunk }], role: 'model' },
                },
              ],
            } as GenerateContentResponse;
          }
        } catch {
          // ignore partial chunks
        }
      }
    }
  }

  async countTokens(_request: CountTokensParameters): Promise<CountTokensResponse> {
    return { totalTokens: 0 };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return { embedding: { values: [] } };
  }
}
