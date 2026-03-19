/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from './contentGenerator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';
import type { LlmRole } from '../telemetry/types.js';
import { MockExhaustedError } from './fakeContentGenerator.js';

/**
 * A ContentGenerator that attempts to use a primary generator,
 * and falls back to a secondary generator if the primary throws MockExhaustedError.
 */
export class FallbackContentGenerator implements ContentGenerator {
  get userTier() {
    return this.primary.userTier;
  }
  get userTierName() {
    return this.primary.userTierName;
  }
  get paidTier() {
    return this.primary.paidTier;
  }

  constructor(
    private readonly primary: ContentGenerator,
    private readonly fallback: ContentGenerator,
    private readonly onFallback?: (method: string) => void,
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    try {
      return await this.primary.generateContent(request, userPromptId, role);
    } catch (error) {
      if (error instanceof MockExhaustedError) {
        this.onFallback?.('generateContent');
        return this.fallback.generateContent(request, userPromptId, role);
      }
      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      return await this.primary.generateContentStream(
        request,
        userPromptId,
        role,
      );
    } catch (error) {
      if (error instanceof MockExhaustedError) {
        this.onFallback?.('generateContentStream');
        return this.fallback.generateContentStream(request, userPromptId, role);
      }
      throw error;
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      if (!this.primary.countTokens) {
        throw new MockExhaustedError('countTokens');
      }
      return await this.primary.countTokens(request);
    } catch (error) {
      if (error instanceof MockExhaustedError && this.fallback.countTokens) {
        this.onFallback?.('countTokens');
        return this.fallback.countTokens(request);
      }
      throw error;
    }
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    try {
      if (!this.primary.embedContent) {
        throw new MockExhaustedError('embedContent');
      }
      return await this.primary.embedContent(request);
    } catch (error) {
      if (error instanceof MockExhaustedError && this.fallback.embedContent) {
        this.onFallback?.('embedContent');
        return this.fallback.embedContent(request);
      }
      throw error;
    }
  }
}
