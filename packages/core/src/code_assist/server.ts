/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongrunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from './types.js';
import {
  CaCountTokenResponse,
  CaGenerateContentResponse,
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';
import { Readable } from 'node:stream';

interface ErrorData {
  error?: {
    message?: string;
  };
}

interface GaxiosResponse {
  status: number;
  data: unknown;
}

interface StreamError extends Error {
  status?: number;
  response?: GaxiosResponse;
}

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  private userTier: UserTierId | undefined = undefined;

  constructor(
    readonly client: OAuth2Client,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
    readonly sessionId?: string,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.requestStreamingPost<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
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
    const resp = await this.requestPost<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongrunningOperationResponse> {
    return await this.requestPost<LongrunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.requestPost<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestGet<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestPost<CodeAssistGlobalUserSettingResponse>(
      'setCodeAssistGlobalUserSetting',
      req,
    );
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const resp = await this.requestPost<CaCountTokenResponse>(
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

  async requestPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
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

  async requestGet<T>(method: string, signal?: AbortSignal): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data as T;
  }

  async requestStreamingPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
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
      // Convert ReadableStream to Node.js stream if needed
      let nodeStream: NodeJS.ReadableStream;

      if (res.data instanceof ReadableStream) {
        // Convert Web ReadableStream to Node.js Readable stream
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeStream = Readable.fromWeb(res.data as any);
      } else if (
        res.data &&
        typeof (res.data as NodeJS.ReadableStream).on === 'function'
      ) {
        // Already a Node.js stream
        nodeStream = res.data as NodeJS.ReadableStream;
      } else {
        // If res.data is not a stream, it might be an error response
        // Try to extract error information from the response
        let errorMessage =
          'Response data is not a readable stream. This may indicate a server error or quota issue.';

        if (res.data && typeof res.data === 'object') {
          // Check if this is an error response with error details
          const errorData = res.data as ErrorData;
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          }
        }

        // Create an error that looks like a quota error if it contains quota information
        const error: StreamError = new Error(errorMessage);
        // Add status and response properties so it can be properly handled by retry logic
        error.status = res.status;
        error.response = res;
        throw error;
      }

      const rl = readline.createInterface({
        input: nodeStream,
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

  async getTier(): Promise<UserTierId | undefined> {
    if (this.userTier === undefined) {
      await this.detectUserTier();
    }
    return this.userTier;
  }

  private async detectUserTier(): Promise<void> {
    try {
      // Reset user tier when detection runs
      this.userTier = undefined;

      // Only attempt tier detection if we have a project ID
      if (this.projectId) {
        const loadRes = await this.loadCodeAssist({
          cloudaicompanionProject: this.projectId,
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
            duetProject: this.projectId,
          },
        });
        if (loadRes.currentTier) {
          this.userTier = loadRes.currentTier.id;
        }
      }
    } catch (error) {
      // Silently fail - this is not critical functionality
      // We'll default to FREE tier behavior if tier detection fails
      console.debug('User tier detection failed:', error);
    }
  }

  getMethodUrl(method: string): string {
    const endpoint = process.env.CODE_ASSIST_ENDPOINT ?? CODE_ASSIST_ENDPOINT;
    return `${endpoint}/${CODE_ASSIST_API_VERSION}:${method}`;
  }
}
