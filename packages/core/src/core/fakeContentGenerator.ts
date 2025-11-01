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
  type Content,
} from '@google/genai';
import { promises } from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import { partToString } from '../utils/partUtils.js';

export type FakeResponse =
  | {
      method: 'generateContent';
      request?: string;
      response: GenerateContentResponse;
    }
  | {
      method: 'generateContentStream';
      request?: string;
      response: GenerateContentResponse[];
    }
  | {
      method: 'countTokens';
      request?: string;
      response: CountTokensResponse;
    }
  | {
      method: 'embedContent';
      request?: string;
      response: EmbedContentResponse;
    };

export function getRequestString(request: unknown): string | undefined {
  // We need to safely cast 'request' to something with contents
  const req = request as { contents?: Content[] };
  if (Array.isArray(req.contents) && req.contents.length > 0) {
    const lastContent = req.contents[req.contents.length - 1];
    if (
      lastContent &&
      Array.isArray(lastContent.parts) &&
      lastContent.parts.length > 0
    ) {
      const part = lastContent.parts[lastContent.parts.length - 1];
      const text = partToString(part, { verbose: true });
      if (text) return text;
      return safeJsonStringify(part);
    }
  }
  // Handle embedContent which might have 'content' instead of 'contents'
  const embedReq = request as { content?: Content };
  if (
    embedReq.content &&
    Array.isArray(embedReq.content.parts) &&
    embedReq.content.parts.length > 0
  ) {
    const part = embedReq.content.parts[embedReq.content.parts.length - 1];
    const text = partToString(part, { verbose: true });
    if (text) return text;
    return safeJsonStringify(part);
  }

  return undefined;
}

// A ContentGenerator that responds with canned responses.
//
// Typically these would come from a file, provided by the `--fake-responses`
// CLI argument.
export class FakeContentGenerator implements ContentGenerator {
  private callCounter = 0;
  private sequentialResponses: FakeResponse[] = [];
  private keyedResponses = new Map<string, FakeResponse[]>();
  userTier?: UserTierId;

  constructor(responses: FakeResponse[]) {
    for (const res of responses) {
      if (res.request) {
        // res.request is already a string
        if (!this.keyedResponses.has(res.request)) {
          this.keyedResponses.set(res.request, []);
        }
        this.keyedResponses.get(res.request)!.push(res);
      } else {
        this.sequentialResponses.push(res);
      }
    }
  }

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
    let keyedResponse: FakeResponse | undefined;

    // Try to find a keyed response first
    const key = getRequestString(request);
    if (key !== undefined) {
      const responses = this.keyedResponses.get(key);
      if (responses && responses.length > 0) {
        if (responses.length > 0) {
          keyedResponse = responses.shift();
        } else {
          console.warn(`No more keyed responses for request: ${key}`);
        }
      }
    }

    // Fallback to sequential if no keyed response found
    const response =
      keyedResponse ??
      (this.sequentialResponses.length > this.callCounter
        ? this.sequentialResponses[this.callCounter++]
        : undefined);

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
