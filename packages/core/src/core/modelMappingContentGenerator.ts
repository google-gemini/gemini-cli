/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CountTokensResponse,
  type GenerateContentResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type EmbedContentResponse,
  type EmbedContentParameters,
} from '@google/genai';
import { type ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';

export class ModelMappingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly mappings: Record<string, string>,
  ) {}

  get userTier(): UserTierId | undefined {
    return this.wrapped.userTier;
  }

  get userTierName(): string | undefined {
    return this.wrapped.userTierName;
  }

  get paidTier(): GeminiUserTier | undefined {
    return this.wrapped.paidTier;
  }

  private mapModel<T extends { model?: string }>(req: T): T {
    if (req.model && this.mappings[req.model]) {
      return {
        ...req,
        model: this.mappings[req.model],
      };
    }
    return req;
  }

  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return this.wrapped.generateContent(
      this.mapModel(request),
      userPromptId,
      role,
    );
  }

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.wrapped.generateContentStream(
      this.mapModel(request),
      userPromptId,
      role,
    );
  }

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(this.mapModel(request));
  }

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(this.mapModel(request));
  }
}
