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
  LongRunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import {
  Content,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import {toContents} from './converter.js';
import { UserTierId } from './types.js';
import {
  CaCountTokenResponse,
  CaGenerateContentResponse,
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/loggers.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';
import { Config } from '../config/config.js';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly client: OAuth2Client,
    readonly config: Config,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
    readonly sessionId?: string,
    readonly userTier?: UserTierId,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    this._logApiRequest(toContents(req.contents), req.model, userPromptId);
    const resps = await this.requestStreamingPost<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(
        req,
        userPromptId,
        this.projectId,
        this.sessionId,
      ),
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
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    this._logApiRequest(toContents(req.contents), req.model, userPromptId);
    const resp = await this.requestPost<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(
        req,
        userPromptId,
        this.projectId,
        this.sessionId,
      ),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongRunningOperationResponse> {
    return await this.requestPost<LongRunningOperationResponse>(
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
      const rl = readline.createInterface({
        input: res.data as NodeJS.ReadableStream,
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

  getMethodUrl(method: string): string {
    const endpoint = process.env.CODE_ASSIST_ENDPOINT ?? CODE_ASSIST_ENDPOINT;
    return `${endpoint}/${CODE_ASSIST_API_VERSION}:${method}`;
  }

  private _getRequestTextFromContents(contents: Content[]): string {
    return JSON.stringify(contents);
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
    prompt_id: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(model, prompt_id, requestText),
    );
  }

  private async _logApiResponse(
    durationMs: number,
    prompt_id: string,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    prompt_id: string,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
      ),
    );
  }
}
