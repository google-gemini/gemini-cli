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
  EmbedContentParameters,
  Part,
  FinishReason,
} from '@google/genai';
import { OpenAI } from 'openai';
import type { ContentGenerator } from './contentGenerator.js';

export interface LocalLLMConfig {
  baseURL: string;
  apiKey?: string;
  model: string;
}

/**
 * ContentGenerator implementation for local LLMs using OpenAI-compatible APIs
 * (e.g., LM Studio, Ollama, LocalAI, etc.)
 */
export class LocalLLMContentGenerator implements ContentGenerator {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: LocalLLMConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey || 'not-needed', // Some local LLMs don't require API keys
    });
    this.defaultModel = config.model;
  }

  /**
   * Convert Google Gemini content format to OpenAI messages format
   */
  private convertToOpenAIMessages(
    contents: unknown, // ContentListUnion can be string, Content, Content[], or Part
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Handle string input
    if (typeof contents === 'string') {
      messages.push({
        role: 'user',
        content: contents,
      });
      return messages;
    }

    // Handle Part type (has text property but no role)
    if (
      contents &&
      typeof contents === 'object' &&
      'text' in contents &&
      !('role' in contents)
    ) {
      const text =
        typeof (contents as { text?: unknown }).text === 'string'
          ? (contents as { text: string }).text
          : '';
      messages.push({
        role: 'user',
        content: text,
      });
      return messages;
    }

    const contentArray = Array.isArray(contents) ? contents : [contents];

    for (const content of contentArray) {
      // Handle string items
      if (typeof content === 'string') {
        messages.push({
          role: 'user',
          content,
        });
        continue;
      }

      // Handle Part type
      if (content && 'text' in content && !('role' in content)) {
        messages.push({
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: (content as any).text || '',
        });
        continue;
      }

      const role: 'user' | 'assistant' | 'system' =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (content as any).role === 'user'
          ? 'user'
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (content as any).role === 'model'
            ? 'assistant'
            : 'system';

      // Combine all text parts into a single message
      let textContent = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((content as any).parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const part of (content as any).parts) {
          if (typeof part === 'string') {
            textContent += part + '\n';
          } else if (part && typeof part === 'object' && 'text' in part) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            textContent += (part as any).text + '\n';
          }
          // Note: Local LLMs may not support function calls, inline data, etc.
          // You can extend this to handle more complex content types
        }
      }

      if (textContent.trim()) {
        messages.push({
          role: role as 'user' | 'assistant' | 'system',
          content: textContent.trim(),
        });
      }
    }

    return messages;
  }

  /**
   * Convert OpenAI response to Google Gemini response format
   */
  private convertToGeminiResponse(
    openaiResponse: OpenAI.Chat.ChatCompletion,
  ): GenerateContentResponse {
    const choice = openaiResponse.choices[0];
    const content = choice?.message?.content || '';

    const parts: Part[] = [{ text: content }];

    return {
      text: content,
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: this.mapFinishReason(choice?.finish_reason),
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: openaiResponse.usage?.prompt_tokens || 0,
        candidatesTokenCount: openaiResponse.usage?.completion_tokens || 0,
        totalTokenCount: openaiResponse.usage?.total_tokens || 0,
      },
    } as GenerateContentResponse;
  }

  /**
   * Convert OpenAI streaming chunk to Gemini response format
   */
  private convertStreamChunkToGeminiResponse(
    chunk: OpenAI.Chat.ChatCompletionChunk,
  ): GenerateContentResponse {
    const choice = chunk.choices[0];
    const content = choice?.delta?.content || '';

    const parts: Part[] = content ? [{ text: content }] : [];

    return {
      text: content,
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: this.mapFinishReason(choice?.finish_reason),
          index: 0,
        },
      ],
    } as GenerateContentResponse;
  }

  /**
   * Map OpenAI finish reasons to Gemini finish reasons
   */
  private mapFinishReason(
    openaiReason?: string | null,
  ): FinishReason | undefined {
    if (!openaiReason) return undefined;

    switch (openaiReason) {
      case 'stop':
        return 'STOP' as FinishReason;
      case 'length':
        return 'MAX_TOKENS' as FinishReason;
      case 'content_filter':
        return 'SAFETY' as FinishReason;
      default:
        return 'OTHER' as FinishReason;
    }
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    try {
      const messages = this.convertToOpenAIMessages(request.contents);

      const completion = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages,
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
        top_p: request.config?.topP,
      });

      return this.convertToGeminiResponse(completion);
    } catch (error) {
      throw new Error(
        `Local LLM API error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.streamGenerator(request);
  }

  private async *streamGenerator(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      const messages = this.convertToOpenAIMessages(request.contents);

      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages,
        temperature: request.config?.temperature,
        max_tokens: request.config?.maxOutputTokens,
        top_p: request.config?.topP,
        stream: true,
      });

      for await (const chunk of stream) {
        yield this.convertStreamChunkToGeminiResponse(chunk);
      }
    } catch (error) {
      throw new Error(
        `Local LLM API streaming error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Token counting is not standardized in OpenAI-compatible APIs
    // Provide a rough estimate based on content length
    let totalText = '';

    if (request.contents) {
      // Handle string input
      if (typeof request.contents === 'string') {
        totalText = request.contents;
      } else {
        const contentArray = Array.isArray(request.contents)
          ? request.contents
          : [request.contents];

        for (const content of contentArray) {
          // Handle string items
          if (typeof content === 'string') {
            totalText += content;
            continue;
          }

          // Handle Content objects
          if ('parts' in content && content.parts) {
            for (const part of content.parts) {
              if (typeof part === 'string') {
                totalText += part;
              } else if ('text' in part && part.text) {
                totalText += part.text;
              }
            }
          }
        }
      }
    }

    // Rough estimate: ~4 characters per token
    const estimatedTokens = Math.ceil(totalText.length / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Embedding is not commonly supported by all local LLMs
    // Return a minimal response
    throw new Error(
      'Embedding is not supported by local LLM provider. Please use a different provider for embedding tasks.',
    );
  }
}
