/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  Part,
  EmbedContentParameters,
  GenerateContentResponse,
  GenerateContentParameters,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { retryWithBackoff } from '../utils/retry.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Options for the generateJson utility function.
 */
export interface GenerateJsonOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history. */
  contents: Content[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * Options for the generateContent utility function.
 */
export interface GenerateContentOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history. */
  contents: Content[];
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * A client dedicated to stateless, utility-focused LLM calls.
 */
export class BaseLlmClient {
  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
  ) {}

  async generateJson(
    options: GenerateJsonOptions,
  ): Promise<Record<string, unknown>> {
    const {
      schema,
      modelConfigKey,
      contents,
      systemInstruction,
      abortSignal,
      promptId,
      maxAttempts,
    } = options;

    const { model, generateContentConfig } =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);

    const shouldRetryOnContent = (response: GenerateContentResponse) => {
      const text = getResponseText(response)?.trim();
      if (!text) {
        return true; // Retry on empty response
      }
      try {
        // We don't use the result, just check if it's valid JSON
        JSON.parse(this.cleanJsonResponse(text, model));
        return false; // It's valid, don't retry
      } catch (_e) {
        return true; // It's not valid, retry
      }
    };

    const result = await this._generateWithRetry(
      {
        model,
        contents,
        config: {
          ...generateContentConfig,
          ...(systemInstruction && { systemInstruction }),
          responseJsonSchema: schema,
          responseMimeType: 'application/json',
          abortSignal,
        },
      },
      promptId,
      maxAttempts,
      shouldRetryOnContent,
      'generateJson',
    );

    // If we are here, the content is valid (not empty and parsable).
    return JSON.parse(
      this.cleanJsonResponse(getResponseText(result)!.trim(), model),
    );
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.config.getEmbeddingModel(),
      contents: texts,
    };

    const embedContentResponse =
      await this.contentGenerator.embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  private cleanJsonResponse(text: string, model: string): string {
    const prefix = '```json';
    const suffix = '```';
    if (text.startsWith(prefix) && text.endsWith(suffix)) {
      logMalformedJsonResponse(
        this.config,
        new MalformedJsonResponseEvent(model),
      );
      return text.substring(prefix.length, text.length - suffix.length).trim();
    }
    return text;
  }

  async generateContent(
    options: GenerateContentOptions,
  ): Promise<GenerateContentResponse> {
    const {
      modelConfigKey,
      contents,
      systemInstruction,
      abortSignal,
      promptId,
      maxAttempts,
    } = options;

    const { model, generateContentConfig } =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);

    const shouldRetryOnContent = (response: GenerateContentResponse) => {
      const text = getResponseText(response)?.trim();
      return !text; // Retry on empty response
    };

    return this._generateWithRetry(
      {
        model,
        contents,
        config: {
          ...generateContentConfig,
          ...(systemInstruction && { systemInstruction }),
          abortSignal,
        },
      },
      promptId,
      maxAttempts,
      shouldRetryOnContent,
      'generateContent',
    );
  }

  private async _generateWithRetry(
    requestParams: GenerateContentParameters,
    promptId: string,
    maxAttempts: number | undefined,
    shouldRetryOnContent: (response: GenerateContentResponse) => boolean,
    errorContext: 'generateJson' | 'generateContent',
  ): Promise<GenerateContentResponse> {
    const abortSignal = requestParams.config?.abortSignal;

    try {
      const apiCall = () =>
        this.contentGenerator.generateContent(requestParams, promptId);

      return await retryWithBackoff(apiCall, {
        shouldRetryOnContent,
        maxAttempts: maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      });
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }

      // Check if the error is from exhausting retries, and report accordingly.
      if (
        error instanceof Error &&
        error.message.includes('Retry attempts exhausted')
      ) {
        await reportError(
          error,
          `API returned invalid content after all retries.`,
          requestParams.contents as Content[],
          `${errorContext}-invalid-content`,
        );
      } else {
        await reportError(
          error,
          `Error generating content via API.`,
          requestParams.contents as Content[],
          `${errorContext}-api`,
        );
      }

      throw new Error(`Failed to generate content: ${getErrorMessage(error)}`);
    }
  }
}
