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
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import { CcpaResponse, toCcpaRequest, fromCcpaResponse } from './converter.js';
import { PassThrough } from 'node:stream';

// TODO: Use production endpoint once it supports our methods.
export const CCPA_ENDPOINT =
  'https://staging-cloudcode-pa.sandbox.googleapis.com';
export const CCPA_API_VERSION = 'v1internal';

export class CcpaServer implements ContentGenerator {
  constructor(
    readonly auth: OAuth2Client,
    readonly projectId?: string,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.streamEndpoint<CcpaResponse>(
      'streamGenerateContent',
      toCcpaRequest(req, this.projectId),
    );
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const resp of resps) {
        yield fromCcpaResponse(resp);
      }
    })();
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const resp = await this.callEndpoint<CcpaResponse>(
      'generateContent',
      toCcpaRequest(req, this.projectId),
    );
    return fromCcpaResponse(resp);
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

    return (async function* (): AsyncGenerator<T> {
      const rl = readline.createInterface({
        input: res.data as PassThrough,
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
