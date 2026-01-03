/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import type { ContentGenerator, Model } from './contentGenerator.js';

/**
 * Wrapper for GoogleGenAI to implement ContentGenerator interface and add listModels.
 */
export class GeminiContentGenerator implements ContentGenerator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private models: any;

  constructor(
    googleGenAI: GoogleGenAI,
    private readonly apiKey?: string,
  ) {
    this.models = googleGenAI.models;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return this.models.generateContent(request, userPromptId);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.models.generateContentStream(request, userPromptId);
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.models.countTokens(request);
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.models.embedContent(request);
  }

  async listModels(): Promise<Model[]> {
    if (!this.apiKey) {
      return [];
    }
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models`,
        {
          headers: {
            'x-goog-api-key': this.apiKey,
          },
        },
      );
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.models || []).map(
        (m: {
          name: string;
          displayName: string;
          description: string;
          supportedGenerationMethods: string[];
        }) => ({
          name: m.name.replace(/^models\//, ''),
          displayName: m.displayName,
          description: m.description,
          supportedGenerationMethods: m.supportedGenerationMethods,
        }),
      );
    } catch {
      return [];
    }
  }
}
