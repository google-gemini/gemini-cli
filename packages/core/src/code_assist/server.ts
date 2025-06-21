/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthClient } from 'google-auth-library';
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
import {
  CaGenerateContentResponse,
  toGenerateContentRequest,
  fromGenerateContentResponse,
  toCountTokenRequest,
  fromCountTokenResponse,
  CaCountTokenResponse,
} from './converter.js';
import { PassThrough } from 'node:stream';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

// TODO: Use production endpoint once it supports our methods.
export const CODE_ASSIST_ENDPOINT =
  process.env.CODE_ASSIST_ENDPOINT ?? 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly auth: AuthClient,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.streamEndpoint<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(req, this.projectId),
      req.config?.abortSignal,
    );
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const resp of resps) {
        yield fromGenerateContentResponse(resp);
      }
    })();
  }

  async generateContent(
    req: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const resp = await this.callEndpoint<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(req, this.projectId),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
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

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const resp = await this.callEndpoint<CaCountTokenResponse>(
      'countTokens',
      toCountTokenRequest(req),
    );
    return fromCountTokenResponse(resp);
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }

  async callEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }

  async streamEndpoint<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.auth.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`,
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'stream',
      body: JSON.stringify(req),
      signal,
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
