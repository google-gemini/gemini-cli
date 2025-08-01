/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { DEFAULT_DEEPSEEK_MODEL } from '../config/models.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * DeepSeek Content Generator that wraps OpenAIContentGenerator
 * Since DeepSeek uses OpenAI-compatible API format
 */
export class DeepSeekContentGenerator implements ContentGenerator {
  private openaiGenerator: OpenAIContentGenerator;

  constructor(apiKey: string, model: string = DEFAULT_DEEPSEEK_MODEL) {
    this.openaiGenerator = new OpenAIContentGenerator(apiKey, DEEPSEEK_BASE_URL, model);
  }

  /**
   * Convert OpenAI API errors to DeepSeek API errors for consistency
   */
  private convertError(error: Error): Error {
    if (error.message.startsWith('OpenAI API error:')) {
      const newMessage = error.message.replace('OpenAI API error:', 'DeepSeek API error:');
      const newError = new Error(newMessage);
      newError.stack = error.stack;
      return newError;
    }
    return error;
  }

  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    try {
      return await this.openaiGenerator.generateContent(request);
    } catch (error) {
      throw this.convertError(error as Error);
    }
  }

  async generateContentStream(request: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      return await this.openaiGenerator.generateContentStream(request);
    } catch (error) {
      throw this.convertError(error as Error);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    try {
      return await this.openaiGenerator.countTokens(request);
    } catch (error) {
      throw this.convertError(error as Error);
    }
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // DeepSeek doesn't provide embedding endpoints, so we'll throw a more specific error
    throw new Error('DeepSeek does not support embeddings. Please use Gemini for embedding operations.');
  }
}
