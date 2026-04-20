/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type GenerateContentResponse,
  type GenerateContentParameters,
  type CountTokensResponse,
  type CountTokensParameters,
  type EmbedContentResponse,
  type EmbedContentParameters,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';

import { debugLogger } from '../utils/debugLogger.js';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAiContentPart[];
}

interface OpenAiContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export class OpenAiContentGenerator implements ContentGenerator {
  constructor(
    private readonly config: {
      apiKey?: string;
      baseUrl?: string;
      headers?: Record<string, string>;
    },
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const { model, contents, config } = request;
    const messages = this.mapContentsToMessages(
      contents as any,
      (config as any)?.systemInstruction,
    );

    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    debugLogger.log(
      `[OpenAiContentGenerator] Sending request to ${url} for model ${model}`,
    );
    debugLogger.log(
      `[OpenAiContentGenerator] Request body: ${JSON.stringify({ model, messages })}`,
    );

    const body = {
      model,
      messages,
      temperature: config?.temperature ?? 1,
      top_p: config?.topP ?? 1,
      max_tokens: config?.maxOutputTokens,
      stop: config?.stopSequences,
      ...(config?.responseMimeType === 'application/json' && {
        response_format: { type: 'json_object' },
      }),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as Record<string, unknown>)?.['abortSignal'] as AbortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI API request failed with status ${response.status}: ${errorText}`,
      );
    }

    const json = (await response.json()) as unknown;
    const mappedResponse = this.mapResponseToGemini(json);

    debugLogger.log(
      `[OpenAiContentGenerator] Received response for model ${model}`,
    );
    debugLogger.log(
      `[OpenAiContentGenerator] Response text: ${mappedResponse.text}`,
    );
    debugLogger.log(
      `[OpenAiContentGenerator] Usage: ${JSON.stringify(mappedResponse.usageMetadata)}`,
    );

    return mappedResponse;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const response = await this.generateContent(request, _userPromptId, _role);
    async function* stream() {
      yield response;
    }
    return stream();
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return { totalTokens: 0 };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embeddings not yet supported for OpenAI provider.');
  }

  private mapContentsToMessages(
    contents: any[],
    systemInstruction?: any,
  ): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];

    if (systemInstruction) {
      let systemText = '';
      if (typeof systemInstruction === 'string') {
        systemText = systemInstruction;
      } else if (systemInstruction.parts) {
        systemText = (systemInstruction.parts as any[]).map((p: any) => p.text).join('\n');
      } else if (Array.isArray(systemInstruction)) {
        systemText = (systemInstruction as any[]).map((p: any) => p.text).join('\n');
      }
      if (systemText) {
        messages.push({ role: 'system', content: systemText });
      }
    }

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const parts: OpenAiContentPart[] = (content.parts || []).map((part: any) => {
        if ('text' in part && part.text) {
          return { type: 'text', text: part.text };
        }
        if ('inlineData' in part && part.inlineData) {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            },
          };
        }
        return { type: 'text', text: '[Unsupported Part]' };
      });

      if (parts.length === 1 && parts[0].type === 'text') {
        messages.push({ role, content: parts[0].text || '' });
      } else {
        messages.push({ role, content: parts });
      }
    }

    return messages;
  }

  private mapResponseToGemini(openaiJson: unknown): GenerateContentResponse {
    const json = openaiJson as Record<string, unknown>;
    const choices = json['choices'] as
      | Array<Record<string, unknown>>
      | undefined;
    const choice = choices?.[0];
    if (!choice) {
      throw new Error('Invalid response from OpenAI API: No choices found');
    }

    const message = choice['message'] as Record<string, unknown> | undefined;
    const usage = json['usage'] as Record<string, unknown> | undefined;

    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: (message?.['content'] as string) || '' }],
          },
          finishReason: this.mapFinishReason(
            (choice['finish_reason'] as string) || 'stop',
          ),
          index: (choice['index'] as number) ?? 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: (usage?.['prompt_tokens'] as number) ?? 0,
        candidatesTokenCount: (usage?.['completion_tokens'] as number) ?? 0,
        totalTokenCount: (usage?.['total_tokens'] as number) ?? 0,
      },
    } as unknown as GenerateContentResponse;

    Object.defineProperty(response, 'text', {
      get() {
        return (message?.['content'] as string) || '';
      },
    });

    return response;
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop':
        return 'STOP';
      case 'length':
        return 'MAX_TOKENS';
      case 'content_filter':
        return 'SAFETY';
      default:
        return 'OTHER';
    }
  }
}
