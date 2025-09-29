/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';

export type OpenRouterContentGeneratorConfig = {
  apiKey: string;
  baseUrl?: string;
};

export class OpenRouterContentGenerator implements ContentGenerator {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: OpenRouterContentGeneratorConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  async generateContent(
    request: GenerateContentParameters,
    // userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Convert Gemini format to OpenRouter format
    const messages = this.convertGeminiToOpenAI(request.contents as any);
    const model = (request as any).model || 'openrouter/auto';

    const body: any = {
      model,
      messages,
      stream: false,
    };

    if ((request as any).generationConfig) {
      const config = (request as any).generationConfig;
      if (config.maxOutputTokens) body.max_tokens = config.maxOutputTokens;
      if (config.temperature) body.temperature = config.temperature;
      if (config.topP) body.top_p = config.topP;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/sst/opencode',
        'X-Title': 'OpenCode CLI',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Convert OpenAI format back to Gemini format
    return this.convertOpenAIToGemini(data);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    // userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For simplicity, implement non-streaming first
    const result = await this.generateContent(request);
    async function* generator() {
      yield result;
    }
    return generator();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // OpenRouter doesn't have a direct token count API, approximate
    const text = JSON.stringify((request as any).contents);
    const tokens = Math.ceil(text.length / 4); // Rough approximation
    return { totalTokens: tokens };
  }

  async embedContent() // request: EmbedContentParameters,
  : Promise<EmbedContentResponse> {
    // OpenRouter doesn't support embeddings directly, return empty
    return { embeddings: [] };
  }

  private convertGeminiToOpenAI(contents: any[]): any[] {
    // Simple conversion: assume contents are text
    return contents.map((content) => ({
      role: content.role === 'user' ? 'user' : 'assistant',
      content: content.parts?.map((part: any) => part.text).join('') || '',
    }));
  }

  private convertOpenAIToGemini(data: any): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: data.choices[0].message.content }],
          },
          finishReason: 'STOP' as any,
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: data.usage?.prompt_tokens || 0,
        candidatesTokenCount: data.usage?.completion_tokens || 0,
        totalTokenCount: data.usage?.total_tokens || 0,
      },
    } as any;
  }
}
