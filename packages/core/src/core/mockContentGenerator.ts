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

export type MockResponses = {
  generateContent: GenerateContentResponse[];
  generateContentStream: GenerateContentResponse[][];
  countTokens: CountTokensResponse[];
  embedContent: EmbedContentResponse[];
};

// A ContentGenerator that responds with canned responses.
//
// Typically these would come from a file, provided by the `--mock-responses`
// CLI argument.
export class MockContentGenerator implements ContentGenerator {
  private responses: MockResponses;
  private callCounters = {
    generateContent: 0,
    generateContentStream: 0,
    countTokens: 0,
    embedContent: 0,
  };
  userTier?: UserTierId;

  constructor(responses: MockResponses) {
    this.responses = {
      generateContent: responses.generateContent ?? [],
      generateContentStream: responses.generateContentStream ?? [],
      countTokens: responses.countTokens ?? [],
      embedContent: responses.embedContent ?? [],
    };
  }

  static async fromFile(filePath: string): Promise<MockContentGenerator> {
    const fileContent = await promises.readFile(filePath, 'utf-8');
    const responses = JSON.parse(fileContent) as MockResponses;
    return new MockContentGenerator(responses);
  }

  generateContent(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const response =
      this.responses.generateContent[this.callCounters.generateContent++];
    if (!response) {
      throw new Error(
        'No more mock responses for generateContent, got request:\n' +
          safeJsonStringify(_request.contents),
      );
    }
    return Promise.resolve(response);
  }

  async generateContentStream(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const responses =
      this.responses.generateContentStream[
        this.callCounters.generateContentStream++
      ];
    if (!responses) {
      throw new Error(
        'No more mock responses for generateContentStream, got request:\n' +
          safeJsonStringify(_request.contents),
      );
    }

    async function* stream() {
      for (const response of responses) {
        yield response;
      }
    }

    return Promise.resolve(stream());
  }

  countTokens(_request: CountTokensParameters): Promise<CountTokensResponse> {
    const response =
      this.responses.countTokens[this.callCounters.countTokens++];
    if (!response) {
      throw new Error(
        'No more mock responses for countTokens, got request:\n' +
          safeJsonStringify(_request.contents),
      );
    }
    return Promise.resolve(response);
  }

  embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const response =
      this.responses.embedContent[this.callCounters.embedContent++];
    if (!response) {
      throw new Error(
        'No more mock responses for embedContent, got request:\n' +
          safeJsonStringify(_request.contents),
      );
    }
    return Promise.resolve(response);
  }
}
