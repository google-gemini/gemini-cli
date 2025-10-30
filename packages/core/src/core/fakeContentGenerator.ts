/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  type CountTokensResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  EmbedContentResponse,
  type EmbedContentParameters,
} from '@google/genai';
import { promises } from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

export type FakeResponse =
  | {
      method: 'generateContent';
      response: GenerateContentResponse;
    }
  | {
      method: 'generateContentStream';
      response: GenerateContentResponse[];
    }
  | {
      method: 'countTokens';
      response: CountTokensResponse;
    }
  | {
      method: 'embedContent';
      response: EmbedContentResponse;
    };

// A ContentGenerator that responds with canned responses.
//
// Typically these would come from a file, provided by the `--fake-responses`
// CLI argument.
export class FakeContentGenerator implements ContentGenerator {
  private callCounter = 0;
  userTier?: UserTierId;

  constructor(private readonly responses: FakeResponse[]) {}

  static async fromFile(filePath: string): Promise<FakeContentGenerator> {
    const fileContent = await promises.readFile(filePath, 'utf-8');
    const responses = fileContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as FakeResponse);
    return new FakeContentGenerator(responses);
  }

  private getNextResponse<
    M extends FakeResponse['method'],
    R = Extract<FakeResponse, { method: M }>['response'],
  >(method: M, request: unknown): R {
    const response = this.responses[this.callCounter++];
    if (!response) {
      throw new Error(
        `No more mock responses for ${method}, got request:\n` +
          safeJsonStringify(request),
      );
    }
    if (response.method !== method) {
      throw new Error(
        `Unexpected response type, next response was for ${response.method} but expected ${method}`,
      );
    }
    return response.response as R;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return Object.setPrototypeOf(
      this.getNextResponse('generateContent', request),
      GenerateContentResponse.prototype,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const responses = this.getNextResponse('generateContentStream', request);
    async function* stream() {
      for (const response of responses) {
        yield Object.setPrototypeOf(
          response,
          GenerateContentResponse.prototype,
        );
      }
    }
    return stream();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return this.getNextResponse('countTokens', request);
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return Object.setPrototypeOf(
      this.getNextResponse('embedContent', request),
      EmbedContentResponse.prototype,
    );
  }
}
