/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { ApiRequestEvent } from '../telemetry/types.js';
import { Config } from '../config/config.js';
import { logApiRequest } from '../telemetry/loggers.js';
import { ContentGenerator } from './contentGenerator.js';
import { toContents } from '../code_assist/converter.js';

/**
 * A decorator that wraps a ContentGenerator to add logging to API calls.
 */
export class LoggingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {}

  private logApiRequest(
    contents: Content[],
    model: string,
    promptId: string,
  ): void {
    const requestText = JSON.stringify(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(model, promptId, requestText),
    );
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    this.logApiRequest(toContents(req.contents), req.model, userPromptId);
    return this.wrapped.generateContent(req, userPromptId);
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    this.logApiRequest(toContents(req.contents), req.model, userPromptId);
    return this.wrapped.generateContentStream(req, userPromptId);
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(req);
  }
}
