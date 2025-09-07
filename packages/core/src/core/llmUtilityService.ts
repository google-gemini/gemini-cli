/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  GenerateContentConfig,
  Part,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Options for the generateJson utility function.
 */
export interface GenerateJsonOptions {
  /** The input prompt or history. */
  contents: Content[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /** The specific model to use for this task. */
  model: string;
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /**
   * Overrides for generation configuration (e.g., temperature).
   */
  config?: Omit<GenerateContentConfig, 'systemInstruction' | 'responseJsonSchema' | 'responseMimeType' | 'tools' | 'abortSignal'>;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
   /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
}

/**
 * A service dedicated to stateless, utility-focused LLM calls.
 */
export class LlmUtilityService {
  // Default configuration for utility tasks
  private readonly defaultUtilityConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };

  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
  ) {}

  async generateJson(options: GenerateJsonOptions): Promise<Record<string, unknown>> {
    const { contents, schema, model, abortSignal, systemInstruction, promptId } = options;

    const requestConfig: GenerateContentConfig = {
      abortSignal,
      ...this.defaultUtilityConfig,
      ...options.config,
      ...(systemInstruction && { systemInstruction }),
      responseJsonSchema: schema,
      responseMimeType: 'application/json',
    };

    try {
      const apiCall = () => this.contentGenerator.generateContent(
        {
          model,
          config: requestConfig,
          contents,
        },
        promptId,
      );

      const result = await retryWithBackoff(apiCall);

      let text = getResponseText(result)?.trim();
      if (!text) {
        const error = new Error('API returned an empty response for generateJson.');
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }

      text = this.cleanJsonResponse(text, model);

      try {
        return JSON.parse(text);
      } catch (parseError) {
        const error = new Error(`Failed to parse API response as JSON: ${getErrorMessage(parseError)}`);
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw error;
      }

    } catch (error) {
       if (abortSignal.aborted) {
        throw error;
      }

      if (error instanceof Error && (
          error.message === 'API returned an empty response for generateJson.' ||
          error.message.startsWith('Failed to parse API response as JSON:')
      )) {
          // We perform this check so that we don't report these again.
      } else {
        await reportError(
            error,
            'Error generating JSON content via API.',
            contents,
            'generateJson-api',
        );
      }

      throw new Error(`Failed to generate JSON content: ${getErrorMessage(error)}`);
    }
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
}
