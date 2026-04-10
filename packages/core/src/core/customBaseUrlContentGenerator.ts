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
import type { LlmRole } from '../telemetry/llmRole.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { ContentGenerator } from './contentGenerator.js';

/**
 * The SDK streaming path can hang when requests are routed through a custom
 * Gemini-compatible base URL and the upstream returns an immediate HTTP error.
 * Route those calls through the non-streaming API and adapt the response into a
 * single-chunk async generator so upper layers can keep the same interface.
 */
export class CustomBaseUrlContentGenerator implements ContentGenerator {
  constructor(private readonly wrapped: ContentGenerator) {}

  get userTier() {
    return this.wrapped.userTier;
  }

  get userTierName() {
    return this.wrapped.userTierName;
  }

  get paidTier() {
    return this.wrapped.paidTier;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return this.wrapped.generateContent(request, userPromptId, role);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const startTime = Date.now();
    debugLogger.debug(
      '[DEBUG] [CustomBaseUrlContentGenerator] Falling back from generateContentStream to generateContent',
      {
        model: request.model,
        promptId: userPromptId,
        role,
      },
    );

    let response: GenerateContentResponse;
    try {
      response = await this.wrapped.generateContent(
        request,
        userPromptId,
        role,
      );
    } catch (error) {
      debugLogger.debug(
        '[DEBUG] [CustomBaseUrlContentGenerator] Fallback generateContent failed',
        {
          model: request.model,
          promptId: userPromptId,
          role,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }

    debugLogger.debug(
      '[DEBUG] [CustomBaseUrlContentGenerator] Fallback generateContent succeeded',
      {
        model: request.model,
        promptId: userPromptId,
        role,
        durationMs: Date.now() - startTime,
        responseId: response.responseId ?? null,
        candidateCount: response.candidates?.length ?? 0,
      },
    );

    return (async function* () {
      yield response;
    })();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(request);
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(request);
  }
}
