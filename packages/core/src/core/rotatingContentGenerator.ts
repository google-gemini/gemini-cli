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
} from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import {
  getCurrentApiKey,
  rotateToNextApiKey,
  markCurrentKeyUsed,
  loadApiKeys,
} from './multiApiKeyStorage.js';
import {
  classifyGoogleError,
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import { InstallationManager } from '../utils/installationManager.js';

/**
 * A ContentGenerator wrapper that automatically rotates through multiple API keys
 * when rate limits or quota errors are encountered.
 */
export class RotatingContentGenerator implements ContentGenerator {
  private currentGenerator: ContentGenerator | null = null;
  private readonly baseHeaders: Record<string, string>;
  private readonly httpOptions: { headers: Record<string, string> };

  constructor(
    private readonly config: Config,
    private readonly vertexai: boolean = false,
  ) {
    const version = process.env['CLI_VERSION'] || process.version;
    const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
    this.baseHeaders = {
      'User-Agent': userAgent,
    };

    let headers: Record<string, string> = { ...this.baseHeaders };
    if (this.config?.getUsageStatisticsEnabled()) {
      const installationManager = new InstallationManager();
      const installationId = installationManager.getInstallationId();
      headers = {
        ...headers,
        'x-gemini-api-privileged-user-id': `${installationId}`,
      };
    }
    this.httpOptions = { headers };
  }

  /**
   * Initialize or refresh the content generator with the current API key
   */
  private async ensureGenerator(): Promise<ContentGenerator> {
    const apiKey = await getCurrentApiKey();
    if (!apiKey) {
      throw new Error(
        'No API keys available. Please add API keys using /apikeys add command.',
      );
    }

    // Create a new generator with the current API key
    const googleGenAI = new GoogleGenAI({
      apiKey,
      vertexai: this.vertexai,
      httpOptions: this.httpOptions,
    });

    this.currentGenerator = googleGenAI.models;
    return this.currentGenerator;
  }

  /**
   * Handle errors and rotate keys if necessary
   */
  private async handleErrorAndRotate(error: unknown): Promise<boolean> {
    const classifiedError = classifyGoogleError(error);

    // Check if this is a rate limit or quota error
    if (
      classifiedError instanceof TerminalQuotaError ||
      classifiedError instanceof RetryableQuotaError
    ) {
      const reason =
        classifiedError instanceof TerminalQuotaError
          ? 'quota_exhausted'
          : 'rate_limit';

      debugLogger.warn(
        `API key hit ${reason}, attempting to rotate to next key...`,
      );

      const nextKey = await rotateToNextApiKey(reason);
      if (nextKey) {
        // Successfully rotated to a new key
        this.currentGenerator = null; // Force regeneration
        return true; // Indicate that we should retry
      } else {
        // No more keys available
        throw new Error(
          'All API keys have been exhausted or rate limited. Please add more keys or wait for quota reset.',
        );
      }
    }

    // Not a rotation-worthy error, rethrow
    throw error;
  }

  /**
   * Execute an operation with automatic key rotation on rate limit/quota errors
   */
  private async executeWithRotation<T>(
    operation: (generator: ContentGenerator) => Promise<T>,
  ): Promise<T> {
    const maxRotations = (await loadApiKeys())?.keys.length || 1;
    let attempts = 0;

    while (attempts < maxRotations) {
      attempts++;

      try {
        const generator = await this.ensureGenerator();
        const result = await operation(generator);

        // Mark key as successfully used
        await markCurrentKeyUsed();

        return result;
      } catch (error) {
        const shouldRetry = await this.handleErrorAndRotate(error);
        if (!shouldRetry || attempts >= maxRotations) {
          throw error;
        }
        // Continue to next iteration to retry with rotated key
      }
    }

    throw new Error('Max rotation attempts exceeded');
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return this.executeWithRotation((generator) =>
      generator.generateContent(request, userPromptId),
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For streaming, we need a different approach since we can't easily retry mid-stream
    const generator = await this.ensureGenerator();

    try {
      const stream = await generator.generateContentStream(
        request,
        userPromptId,
      );
      await markCurrentKeyUsed();
      return stream;
    } catch (error) {
      const shouldRetry = await this.handleErrorAndRotate(error);
      if (shouldRetry) {
        // Retry once with the new key
        const newGenerator = await this.ensureGenerator();
        const stream = await newGenerator.generateContentStream(
          request,
          userPromptId,
        );
        await markCurrentKeyUsed();
        return stream;
      }
      throw error;
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.executeWithRotation((generator) =>
      generator.countTokens(request),
    );
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.executeWithRotation((generator) =>
      generator.embedContent(request),
    );
  }
}
