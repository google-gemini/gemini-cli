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
import { promises } from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

export type FakeResponses = {
  generateContent: GenerateContentResponse[];
  generateContentStream: GenerateContentResponse[][];
  countTokens: CountTokensResponse[];
  embedContent: EmbedContentResponse[];
};

// A ContentGenerator that responds with canned responses.
//
// Typically these would come from a file, provided by the `--fake-responses`
// CLI argument.
export class FakeContentGenerator implements ContentGenerator {
  private responses: FakeResponses;
  private callCounters = {
    generateContent: 0,
    generateContentStream: 0,
    countTokens: 0,
    embedContent: 0,
  };
  userTier?: UserTierId;

  constructor(responses: FakeResponses) {
    this.responses = {
      generateContent: responses.generateContent ?? [],
      generateContentStream: responses.generateContentStream ?? [],
      countTokens: responses.countTokens ?? [],
      embedContent: responses.embedContent ?? [],
    };
  }

  static async fromFile(filePath: string): Promise<FakeContentGenerator> {
    const fileContent = await promises.readFile(filePath, 'utf-8');
    const responses = JSON.parse(fileContent) as FakeResponses;
    return new FakeContentGenerator(responses);
  }

  private getNextResponse<K extends keyof FakeResponses>(
    method: K,
    request: unknown,
  ): FakeResponses[K][number] {
    const response = this.responses[method][this.callCounters[method]++];
    if (!response) {
      throw new Error(
        `No more mock responses for ${method}, got request:\n` +
          safeJsonStringify(request),
      );
    }
    return response;
  }

  async generateContent(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return this.getNextResponse('generateContent', _request);
  }

  async generateContentStream(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const responses = this.getNextResponse('generateContentStream', _request);
    async function* stream() {
      for (const response of responses) {
        yield response;
      }
    }
    return stream();
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.getNextResponse('countTokens', _request);
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.getNextResponse('embedContent', _request);
  }
}
