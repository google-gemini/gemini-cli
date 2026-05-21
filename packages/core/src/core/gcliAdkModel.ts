/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseLlm,
  type LlmRequest,
  type LlmResponse,
  type BaseLlmConnection,
} from '@google/adk';
import type {
  GenerateContentResponse,
  Content,
  GenerateContentConfig,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';

export interface GcliLlmResponse extends LlmResponse {
  rawResponse: GenerateContentResponse;
}

/**
 * Creates an LlmResponse from a GenerateContentResponse.
 * Locally defined to avoid dependency export resolution issues.
 */
function localCreateLlmResponse(
  response: GenerateContentResponse,
): LlmResponse {
  const usageMetadata = response.usageMetadata;

  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (candidate.content?.parts && candidate.content.parts.length > 0) {
      return {
        content: candidate.content,
        groundingMetadata: candidate.groundingMetadata,
        citationMetadata: candidate.citationMetadata,
        usageMetadata,
        finishReason: candidate.finishReason,
      };
    }

    return {
      errorCode: candidate.finishReason,
      errorMessage: candidate.finishMessage,
      usageMetadata,
      citationMetadata: candidate.citationMetadata,
      finishReason: candidate.finishReason,
    };
  }

  if (response.promptFeedback) {
    return {
      errorCode: response.promptFeedback.blockReason,
      errorMessage: response.promptFeedback.blockReasonMessage,
      usageMetadata,
    };
  }

  return {
    errorCode: 'UNKNOWN_ERROR',
    errorMessage: 'Unknown error.',
    usageMetadata,
  };
}

export class GcliAdkModel extends BaseLlm {
  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly promptId: string,
    private readonly role: LlmRole,
    modelName: string,
  ) {
    super({ model: modelName });
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = true,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<GcliLlmResponse, void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const contents = llmRequest.contents as unknown as Content[];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const config = {
      ...llmRequest.config,
      abortSignal,
    } as unknown as GenerateContentConfig;

    if (stream) {
      const responseStream = await this.contentGenerator.generateContentStream(
        {
          model: this.model,
          contents,
          config,
        },
        this.promptId,
        this.role,
      );

      for await (const chunk of responseStream) {
        const adkResponse = localCreateLlmResponse(chunk);
        yield {
          ...adkResponse,
          rawResponse: chunk,
        };
      }
    } else {
      const response = await this.contentGenerator.generateContent(
        {
          model: this.model,
          contents,
          config,
        },
        this.promptId,
        this.role,
      );
      const adkResponse = localCreateLlmResponse(response);
      yield {
        ...adkResponse,
        rawResponse: response,
      };
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Bidi connections not supported in Dumb Model Swap.');
  }
}
