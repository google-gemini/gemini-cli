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

export class SglangContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl: string = 'http://localhost:30100/v1',
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
        parameters?: Record<string, unknown>;
      };
    }> = [];

    for (const t of toolsConfig.tools) {
      const functionDeclarations = (t as { functionDeclarations?: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }> }).functionDeclarations;
      if (Array.isArray(functionDeclarations)) {
        for (const fd of functionDeclarations) {
          tools.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description,
              parameters: fd.parameters,
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
    if (tools) {
      payload['tools'] = tools;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`SGLang server error (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;
    const parts: Part[] = [];

    if (message?.content) {
      parts.push({ text: message.content });
    }

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          // ignore argument parse error
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
    if (tools) {
      payload['tools'] = tools;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`SGLang stream error (${res.status}): ${await res.text()}`);
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
          if (delta?.content) {
            yield {
              candidates: [
                {
                  content: { parts: [{ text: delta.content }], role: 'model' },
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
