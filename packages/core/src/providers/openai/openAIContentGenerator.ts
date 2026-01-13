/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';
import type { ContentGenerator } from '../../core/contentGenerator.js';
import type { ProviderConfig } from '../types.js';
import {
  translateRequestToOpenAI,
  translateResponseToGemini,
  translateStreamChunkToGemini,
  createToolCallResponse,
} from './translator.js';
import type {
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from './types.js';
import { ToolCallAccumulator } from './streamAccumulator.js';

/**
 * ContentGenerator implementation for OpenAI-compatible APIs.
 * Supports GLM and DeepSeek providers.
 */
export class OpenAICompatibleContentGenerator implements ContentGenerator {
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const openAIRequest = translateRequestToOpenAI(
      request,
      this.config.provider,
    );
    openAIRequest.stream = false;

    const response = await this.makeRequest(openAIRequest);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `${this.config.provider} API error: ${response.status} - ${error}`,
      );
    }

    const openAIResponse =
      (await response.json()) as OpenAIChatCompletionResponse;
    return translateResponseToGemini(openAIResponse);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const openAIRequest = translateRequestToOpenAI(
      request,
      this.config.provider,
    );
    openAIRequest.stream = true;

    const response = await this.makeRequest(openAIRequest);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `${this.config.provider} API error: ${response.status} - ${error}`,
      );
    }

    return this.processSSEStream(response);
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Most OpenAI-compatible APIs don't have a token counting endpoint
    // Could implement tiktoken estimation here if needed
    throw new Error(
      `Token counting not implemented for ${this.config.provider}`,
    );
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Could be implemented if GLM/DeepSeek provide embedding endpoints
    throw new Error(`Embedding not implemented for ${this.config.provider}`);
  }

  /**
   * Make an HTTP request to the OpenAI-compatible API.
   */
  private async makeRequest(
    body: OpenAIChatCompletionRequest,
  ): Promise<Response> {
    // Ensure base URL ends with proper path
    let baseUrl = this.config.baseUrl;
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    // GLM uses v4 in the path already, others need chat/completions
    let endpoint: string;
    if (baseUrl.includes('/v4/') || baseUrl.endsWith('/v4/')) {
      endpoint = `${baseUrl}chat/completions`;
    } else if (baseUrl.endsWith('/v1/')) {
      endpoint = `${baseUrl}chat/completions`;
    } else {
      endpoint = `${baseUrl}v1/chat/completions`;
    }

    // Handle extra_body for providers that support it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody: Record<string, any> = { ...body };
    if (body.extra_body) {
      const extraBody = body.extra_body;
      delete requestBody['extra_body'];
      Object.assign(requestBody, extraBody);
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Process Server-Sent Events stream from the API.
   */
  private async *processSSEStream(
    response: Response,
  ): AsyncGenerator<GenerateContentResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallAccumulator = new ToolCallAccumulator();
    let lastResponseId = '';

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
          if (data === '[DONE]') {
            // Emit any accumulated tool calls at the end
            if (toolCallAccumulator.hasToolCalls()) {
              yield createToolCallResponse(
                toolCallAccumulator.getCompletedToolCalls(),
                lastResponseId,
              );
            }
            return;
          }

          let chunk: OpenAIChatCompletionChunk;
          try {
            chunk = JSON.parse(data) as OpenAIChatCompletionChunk;
          } catch {
            // Skip malformed chunks
            continue;
          }

          lastResponseId = chunk.id;

          // Accumulate tool calls
          const choice = chunk.choices[0];
          if (choice?.delta?.tool_calls) {
            for (const tcDelta of choice.delta.tool_calls) {
              toolCallAccumulator.addDelta(tcDelta);
            }
          }

          // Yield content/reasoning chunks immediately
          const geminiChunk = translateStreamChunkToGemini(chunk);
          if (
            geminiChunk.candidates?.[0]?.content?.parts &&
            geminiChunk.candidates[0].content.parts.length > 0
          ) {
            yield geminiChunk;
          }

          // If we get a finish_reason with tool_calls, emit accumulated tool calls
          if (
            choice?.finish_reason === 'tool_calls' &&
            toolCallAccumulator.hasToolCalls()
          ) {
            yield createToolCallResponse(
              toolCallAccumulator.getCompletedToolCalls(),
              lastResponseId,
            );
            toolCallAccumulator.clear();
          }
        }
      }

      // Handle any remaining tool calls at stream end
      if (toolCallAccumulator.hasToolCalls()) {
        yield createToolCallResponse(
          toolCallAccumulator.getCompletedToolCalls(),
          lastResponseId,
        );
      }
    } finally {
      reader.releaseLock();
    }
  }
}
