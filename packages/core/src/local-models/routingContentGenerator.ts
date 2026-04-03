/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleGenAI,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { OllamaGemmaBridgeManager } from './ollamaGemmaBridge.js';

function createSdkContentGenerator(client: GoogleGenAI): ContentGenerator {
  return {
    generateContent: async (
      request: GenerateContentParameters,
    ): Promise<GenerateContentResponse> =>
      client.models.generateContent(request),
    generateContentStream: async (
      request: GenerateContentParameters,
    ): Promise<AsyncGenerator<GenerateContentResponse>> =>
      client.models.generateContentStream(request),
    countTokens: async (
      request: CountTokensParameters,
    ): Promise<CountTokensResponse> => client.models.countTokens(request),
    embedContent: async (
      request: EmbedContentParameters,
    ): Promise<EmbedContentResponse> => client.models.embedContent(request),
  };
}

class LocalGemmaBridgeContentGenerator implements ContentGenerator {
  private wrapped?: ContentGenerator;
  private initPromise?: Promise<ContentGenerator>;

  constructor(
    private readonly config: Config,
    private readonly bridgeManager: OllamaGemmaBridgeManager,
  ) {}

  private async getWrapped(): Promise<ContentGenerator> {
    if (this.wrapped) {
      return this.wrapped;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.bridgeManager.assertOllamaAvailable();
        const baseUrl = await this.bridgeManager.ensureStarted();
        const client = new GoogleGenAI({
          apiKey: 'local-ollama-placeholder-key',
          httpOptions: { baseUrl },
        });
        return new LoggingContentGenerator(
          createSdkContentGenerator(client),
          this.config,
        );
      })();
    }

    this.wrapped = await this.initPromise;
    return this.wrapped;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return (await this.getWrapped()).generateContent(
      request,
      userPromptId,
      role,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return (await this.getWrapped()).generateContentStream(
      request,
      userPromptId,
      role,
    );
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return (await this.getWrapped()).countTokens(request);
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embeddings are not supported for local Gemma models.');
  }
}

export class RoutingContentGenerator implements ContentGenerator {
  private readonly localGenerator: LocalGemmaBridgeContentGenerator;

  constructor(
    private readonly config: Config,
    private readonly remoteGenerator: ContentGenerator | undefined,
    bridgeManager: OllamaGemmaBridgeManager,
  ) {
    this.localGenerator = new LocalGemmaBridgeContentGenerator(
      config,
      bridgeManager,
    );
  }

  get userTier() {
    return this.remoteGenerator?.userTier;
  }

  get userTierName() {
    return this.remoteGenerator?.userTierName;
  }

  get paidTier() {
    return this.remoteGenerator?.paidTier;
  }

  private resolveGenerator(modelId: string): ContentGenerator {
    if (this.config.canUseModelWithoutAuth(modelId)) {
      return this.localGenerator;
    }
    if (this.remoteGenerator) {
      return this.remoteGenerator;
    }
    throw new Error(
      `Model "${modelId}" requires configured Gemini, Vertex, or Gateway authentication. Configure auth or switch back to an installed local Gemma 4 model.`,
    );
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return this.resolveGenerator(request.model).generateContent(
      request,
      userPromptId,
      role,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.resolveGenerator(request.model).generateContentStream(
      request,
      userPromptId,
      role,
    );
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.resolveGenerator(request.model).countTokens(request);
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.resolveGenerator(request.model).embedContent(request);
  }
}
