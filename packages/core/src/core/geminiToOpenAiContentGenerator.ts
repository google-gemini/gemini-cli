/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import {
  createStreamAccumulator,
  geminiToOpenAiRequest,
  isOpenAiErrorResponse,
  openAiChunkToGeminiChunk,
  openAiToGeminiResponse,
  type OpenAiRequest,
  type OpenAiResponse,
  type OpenAiStreamChunk,
} from './geminiToOpenAiTranslator.js';
import { debugLogger } from '../utils/debugLogger.js';
import { toContents } from '../code_assist/converter.js';

export class GeminiToOpenAiContentGenerator implements ContentGenerator {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly customHeaders?: Record<string, string>,
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: string,
  ): Promise<GenerateContentResponse> {
    const openAiRequest = geminiToOpenAiRequest(request, { stream: false });
    const response = await this.fetchOpenAi(
      openAiRequest,
      request.config?.abortSignal,
    );
    return openAiToGeminiResponse(response, request.model);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const openAiRequest = geminiToOpenAiRequest(request, { stream: true });
    const response = await this.fetchOpenAiStream(
      openAiRequest,
      request.config?.abortSignal,
    );
    return this.streamTranslator(response, request.model);
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      const contents = request.contents ?? [];
      const openAiRequest: OpenAiRequest = {
        model: request.model,
        messages: geminiToOpenAiRequest(
          { model: request.model, contents },
          { stream: false },
        ).messages,
        max_tokens: 1,
        stream: false,
      };
      const response = await this.fetchOpenAi(openAiRequest);
      return {
        totalTokens: response.usage?.total_tokens ?? 0,
      } as CountTokensResponse;
    } catch (e) {
      debugLogger.warn('countTokens via OpenAI endpoint failed:', e);
      return { totalTokens: 0 } as CountTokensResponse;
    }
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    try {
      const base = this.baseUrl.replace(/\/v1\/?$/, '');
      const url = `${base}/v1/embeddings`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.customHeaders,
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const contents = toContents(request.contents);

      const body: Record<string, unknown> = {
        model: request.model,
        input: contents.map(
          (c) =>
            c.parts?.map((p) => ('text' in p ? p.text : '')).join(' ') ?? '',
        ),
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        return { embeddings: [] } as EmbedContentResponse;
      }

      const json: unknown = await resp.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const data = json as Record<string, unknown>;
      const embeddingsData = data['data'];
      if (!Array.isArray(embeddingsData)) {
        return { embeddings: [] } as EmbedContentResponse;
      }

      return {
        embeddings: embeddingsData.map((d: unknown) => {
          if (typeof d !== 'object' || d === null) {
            return { values: [] };
          }
          const entry = d as { embedding?: unknown };
          const embedding = entry.embedding;
          return {
            values: Array.isArray(embedding) ? embedding : [],
          };
        }),
      } as EmbedContentResponse;
    } catch (e) {
      debugLogger.warn('embedContent via OpenAI endpoint failed:', e);
      return { embeddings: [] } as EmbedContentResponse;
    }
  }

  private getCompletionsUrl(): string {
    const base = this.baseUrl.replace(/\/v1\/?$/, '');
    return `${base}/v1/chat/completions`;
  }

  private async fetchOpenAi(
    request: OpenAiRequest,
    signal?: AbortSignal,
  ): Promise<OpenAiResponse> {
    const url = this.getCompletionsUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    });

    if (!resp.ok) {
      await this.handleErrorResponse(resp);
    }

    const json: unknown = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return json as OpenAiResponse;
  }

  private async fetchOpenAiStream(
    request: OpenAiRequest,
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = this.getCompletionsUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    });

    if (!resp.ok) {
      await this.handleErrorResponse(resp);
    }

    return resp;
  }

  private async handleErrorResponse(resp: Response): Promise<never> {
    let errorBody: unknown;
    try {
      errorBody = await resp.json();
    } catch {
      errorBody = { error: { message: resp.statusText } };
    }

    const message = isOpenAiErrorResponse(errorBody)
      ? (errorBody.error?.message ?? resp.statusText)
      : resp.statusText;

    const err: Error & { status?: number } = new Error(
      `OpenAI API error ${resp.status}: ${message}`,
    );
    err.status = resp.status;
    throw err;
  }

  private async *streamTranslator(
    response: Response,
    model: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const accumulator = createStreamAccumulator();
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkId: string | undefined;
    let emittedFinish = false;

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
            if (!emittedFinish) {
              if (!accumulator.finishReason) {
                accumulator.finishReason = 'stop';
              }
              const finalChunk = openAiChunkToGeminiChunk(
                {
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: accumulator.finishReason,
                    },
                  ],
                  model,
                  id: firstChunkId,
                },
                model,
                accumulator,
              );
              if (finalChunk) yield finalChunk;
            }
            return;
          }

          try {
            const chunk: unknown = JSON.parse(data);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const typedChunk = chunk as OpenAiStreamChunk;
            if (!firstChunkId && typedChunk.id) {
              firstChunkId = typedChunk.id;
            }
            const geminiChunk = openAiChunkToGeminiChunk(
              typedChunk,
              model,
              accumulator,
            );
            if (geminiChunk) {
              if (geminiChunk.candidates?.[0]?.finishReason) {
                emittedFinish = true;
              }
              yield geminiChunk;
            }
          } catch {
            continue;
          }
        }
      }

      if (!emittedFinish) {
        if (!accumulator.finishReason) {
          accumulator.finishReason = 'stop';
        }
        const finalChunk = openAiChunkToGeminiChunk(
          {
            choices: [
              { index: 0, delta: {}, finish_reason: accumulator.finishReason },
            ],
            model,
            id: firstChunkId,
          },
          model,
          accumulator,
        );
        if (finalChunk) yield finalChunk;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
