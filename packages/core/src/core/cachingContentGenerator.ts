/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';

import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import type { LlmRole } from '../telemetry/types.js';
import { PromptCache } from '../cache/prompt-cache.js';
import { mergeResponseChunks } from '../utils/generateContentResponseUtilities.js';

export class CachingContentGenerator implements ContentGenerator {
  private readonly promptCache: PromptCache;

  constructor(
    private readonly realGenerator: ContentGenerator,
    projectPath: string,
  ) {
    this.promptCache = new PromptCache(projectPath);
  }

  get userTier(): UserTierId | undefined {
    return this.realGenerator.userTier;
  }

  get userTierName(): string | undefined {
    return this.realGenerator.userTierName;
  }

  get paidTier(): GeminiUserTier | undefined {
    return this.realGenerator.paidTier;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const cached = this.promptCache.get(request, request.model);
    if (cached) {
      if (!Array.isArray(cached)) {
        return cached;
      }
      const merged = mergeResponseChunks(cached);
      if (merged) {
        return merged;
      }
    }

    const response = await this.realGenerator.generateContent(
      request,
      userPromptId,
      role,
    );

    this.promptCache.set(request, request.model, response);
    return response;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const cached = this.promptCache.get(request, request.model);

    if (cached && Array.isArray(cached)) {
      const cachedChunks: GenerateContentResponse[] = cached;
      const streamCached = async function* () {
        for (const chunk of cachedChunks) {
          yield chunk;
        }
      };
      return streamCached();
    } else if (cached && !Array.isArray(cached)) {
      const cachedSingle: GenerateContentResponse = cached;
      const streamSingleCached = async function* () {
        yield cachedSingle;
      };
      return streamSingleCached();
    }

    const realResponses = await this.realGenerator.generateContentStream(
      request,
      userPromptId,
      role,
    );

    const promptCache = this.promptCache;
    const model = request.model;

    const stream = async function* () {
      const chunks: GenerateContentResponse[] = [];
      for await (const response of realResponses) {
        chunks.push(response);
        yield response;
      }
      promptCache.set(request, model, chunks);
    };

    return stream();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.realGenerator.countTokens(request);
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.realGenerator.embedContent(request);
  }
}
