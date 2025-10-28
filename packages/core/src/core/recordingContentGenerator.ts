/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { appendFileSync } from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import type { FakeResponse } from './fakeContentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';

// A ContentGenerator that wraps another content generator and records all the
// responses, with the ability to write them out to a file. These files are
// intended to be consumed later on by a FakeContentGenerator, given the
// `--fake-responses` CLI argument.
//
// Note that only the "interesting" bits of the responses are actually kept.
export class RecordingContentGenerator implements ContentGenerator {
  userTier?: UserTierId;

  constructor(
    private readonly realGenerator: ContentGenerator,
    private readonly filePath: string,
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const response = await this.realGenerator.generateContent(
      request,
      userPromptId,
    );
    const recordedResponse: FakeResponse = {
      method: 'generateContent',
      response: {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
      } as GenerateContentResponse,
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const recordedResponse: FakeResponse = {
      method: 'generateContentStream',
      response: [],
    };

    const realResponses = await this.realGenerator.generateContentStream(
      request,
      userPromptId,
    );

    async function* stream(filePath: string) {
      for await (const response of realResponses) {
        (recordedResponse.response as GenerateContentResponse[]).push({
          candidates: response.candidates,
          usageMetadata: response.usageMetadata,
        } as GenerateContentResponse);
        yield response;
      }
      appendFileSync(filePath, `${safeJsonStringify(recordedResponse)}\n`);
    }

    return Promise.resolve(stream(this.filePath));
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const response = await this.realGenerator.countTokens(request);
    const recordedResponse: FakeResponse = {
      method: 'countTokens',
      response: {
        totalTokens: response.totalTokens,
        cachedContentTokenCount: response.cachedContentTokenCount,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const response = await this.realGenerator.embedContent(request);

    const recordedResponse: FakeResponse = {
      method: 'embedContent',
      response: {
        embeddings: response.embeddings,
        metadata: response.metadata,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }
}
