/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import {
  LoadCodeAssistResponse,
  LoadCodeAssistRequest,
  OnboardUserRequest,
  LongrunningOperationResponse,
} from './types.js';
import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  CountTokensResponse,
  EmbedContentParameters,
} from '@google/genai';
import { Readable } from 'stream';
import * as readline from 'readline';
import type { ReadableStream } from 'node:stream/web';
import { ContentGenerator } from '../core/contentGenerator.js';

// TODO: Use production endpoint once it supports our methods.
export const CCPA_ENDPOINT =
  'https://staging-cloudcode-pa.sandbox.googleapis.com';
export const CCPA_API_VERSION = '/v1internal';

export class CcpaServer implements ContentGenerator {
  constructor(
    readonly auth: OAuth2Client,
    readonly projectId?: string,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return await this.streamEndpoint<GenerateContentResponse>(
      'streamGenerateContent',
      req,
    );
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    return await this.callEndpoint<GenerateContentResponse>(
      'generateContent',
      req,
    );
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongrunningOperationResponse> {
    return await this.callEndpoint<LongrunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.callEndpoint<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async countTokens(_req: CountTokensParameters): Promise<CountTokensResponse> {
    return { totalTokens: 0 };
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }

  async callEndpoint<T>(method: string, req: object): Promise<T> {
    const res = await this.auth.request({
      url: `${CCPA_ENDPOINT}/${CCPA_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-User-Project': this.projectId || '',
      },
      responseType: 'json',
      body: JSON.stringify(req),
    });
    if (res.status !== 200) {
      throw new Error(
        `Failed to fetch from ${method}: ${res.status} ${res.data}`,
      );
    }
    return res.data as T;
  }

  async streamEndpoint<T>(
    method: string,
    req: object,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.auth.request({
      url: `${CCPA_ENDPOINT}/${CCPA_API_VERSION}:${method}`,
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
      body: JSON.stringify(req),
    });
    if (res.status !== 200) {
      throw new Error(
        `Failed to fetch from ${method}: ${res.status} ${res.data}`,
      );
    }

    return (async function* (): AsyncGenerator<T> {
      const rl = readline.createInterface({
        input: Readable.fromWeb(res.data as ReadableStream<Uint8Array>),
        crlfDelay: Infinity, // Recognizes '\r\n' and '\n' as line breaks
      });

      let bufferedLines: string[] = [];
      for await (const line of rl) {
        // blank lines are used to separate JSON objects in the stream
        if (line === '') {
          if (bufferedLines.length === 0) {
            continue; // no data to yield
          }
          yield JSON.parse(bufferedLines.join('\n')) as T;
          bufferedLines = []; // Reset the buffer after yielding
        } else if (line.startsWith('data: ')) {
          bufferedLines.push(line.slice(6).trim());
        } else {
          throw new Error(`Unexpected line format in response: ${line}`);
        }
      }
    })();
  }
}
