/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthClient } from 'google-auth-library';
import type {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongRunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
  ClientMetadata,
  RetrieveUserQuotaRequest,
  RetrieveUserQuotaResponse,
  FetchAdminControlsRequest,
  FetchAdminControlsResponse,
  ConversationOffered,
  ConversationInteraction,
  StreamingLatency,
  RecordCodeAssistMetricsRequest,
} from './types.js';
import type {
  ListExperimentsRequest,
  ListExperimentsResponse,
} from './experiments/types.js';
import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as readline from 'node:readline';
import { Readable } from 'node:stream';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from './types.js';
import type {
  CaCountTokenResponse,
  CaGenerateContentResponse,
} from './converter.js';
import {
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';
import {
  formatProtoJsonDuration,
  recordConversationOffered,
} from './telemetry.js';
import { getClientMetadata } from './experiments/client_metadata.js';
import type { LlmRole } from '../telemetry/types.js';
/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly client: AuthClient,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
    readonly sessionId?: string,
    readonly userTier?: UserTierId,
    readonly userTierName?: string,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const responses =
      await this.requestStreamingPost<CaGenerateContentResponse>(
        'streamGenerateContent',
        toGenerateContentRequest(
          req,
          userPromptId,
          this.projectId,
          this.sessionId,
        ),
        req.config?.abortSignal,
      );

    const streamingLatency: StreamingLatency = {};
    const start = Date.now();
    let isFirst = true;

    return (async function* (
      server: CodeAssistServer,
    ): AsyncGenerator<GenerateContentResponse> {
      for await (const response of responses) {
        if (isFirst) {
          streamingLatency.firstMessageLatency = formatProtoJsonDuration(
            Date.now() - start,
          );
          isFirst = false;
        }

        streamingLatency.totalLatency = formatProtoJsonDuration(
          Date.now() - start,
        );

        const translatedResponse = fromGenerateContentResponse(response);

        await recordConversationOffered(
          server,
          response.traceId,
          translatedResponse,
          streamingLatency,
          req.config?.abortSignal,
        );

        yield translatedResponse;
      }
    })(this);
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const start = Date.now();
    const response = await this.requestPost<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(
        req,
        userPromptId,
        this.projectId,
        this.sessionId,
      ),
      req.config?.abortSignal,
    );
    const duration = formatProtoJsonDuration(Date.now() - start);
    const streamingLatency: StreamingLatency = {
      totalLatency: duration,
      firstMessageLatency: duration,
    };

    const translatedResponse = fromGenerateContentResponse(response);

    await recordConversationOffered(
      this,
      response.traceId,
      translatedResponse,
      streamingLatency,
      req.config?.abortSignal,
    );

    return translatedResponse;
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongRunningOperationResponse> {
    return this.requestPost<LongRunningOperationResponse>('onboardUser', req);
  }

  async getOperation(name: string): Promise<LongRunningOperationResponse> {
    return this.requestGetOperation<LongRunningOperationResponse>(name);
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    try {
      return await this.requestPost<LoadCodeAssistResponse>(
        'loadCodeAssist',
        req,
      );
    } catch (e) {
      if (isVpcScAffectedUser(e)) {
        return {
          currentTier: { id: UserTierId.STANDARD },
        };
      } else {
        throw e;
      }
    }
  }

  async fetchAdminControls(
    req: FetchAdminControlsRequest,
  ): Promise<FetchAdminControlsResponse> {
    return this.requestPost<FetchAdminControlsResponse>(
      'fetchAdminControls',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return this.requestGet<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return this.requestPost<CodeAssistGlobalUserSettingResponse>(
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

  async listExperiments(
    metadata: ClientMetadata,
  ): Promise<ListExperimentsResponse> {
    if (!this.projectId) {
      throw new Error('projectId is not defined for CodeAssistServer.');
    }
    const projectId = this.projectId;
    const req: ListExperimentsRequest = {
      project: projectId,
      metadata: { ...metadata, duetProject: projectId },
    };
    return this.requestPost<ListExperimentsResponse>('listExperiments', req);
  }

  async retrieveUserQuota(
    req: RetrieveUserQuotaRequest,
  ): Promise<RetrieveUserQuotaResponse> {
    return this.requestPost<RetrieveUserQuotaResponse>(
      'retrieveUserQuota',
      req,
    );
  }

  async recordConversationOffered(
    conversationOffered: ConversationOffered,
  ): Promise<void> {
    if (!this.projectId) {
      return;
    }

    await this.recordCodeAssistMetrics({
      project: this.projectId,
      metadata: await getClientMetadata(),
      metrics: [{ conversationOffered, timestamp: new Date().toISOString() }],
    });
  }

  async recordConversationInteraction(
    interaction: ConversationInteraction,
  ): Promise<void> {
    if (!this.projectId) {
      return;
    }

    await this.recordCodeAssistMetrics({
      project: this.projectId,
      metadata: await getClientMetadata(),
      metrics: [
        {
          conversationInteraction: interaction,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  async recordCodeAssistMetrics(
    request: RecordCodeAssistMetricsRequest,
  ): Promise<void> {
    return this.requestPost<void>('recordCodeAssistMetrics', request);
  }

  async requestPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.client.request<T>({
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
    return res.data;
  }

  private async makeGetRequest<T>(
    url: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.client.request<T>({
      url,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data;
  }

  async requestGet<T>(method: string, signal?: AbortSignal): Promise<T> {
    return this.makeGetRequest<T>(this.getMethodUrl(method), signal);
  }

  async requestGetOperation<T>(name: string, signal?: AbortSignal): Promise<T> {
    return this.makeGetRequest<T>(this.getOperationUrl(name), signal);
  }

  async requestStreamingPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.client.request<AsyncIterable<unknown>>({
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
        input: Readable.from(res.data),
        crlfDelay: Infinity, // Recognizes '\r\n' and '\n' as line breaks
      });

      let bufferedLines: string[] = [];
      for await (const line of rl) {
        if (line.startsWith('data: ')) {
          bufferedLines.push(line.slice(6).trim());
        } else if (line === '') {
          if (bufferedLines.length === 0) {
            continue; // no data to yield
          }
          yield JSON.parse(bufferedLines.join('\n'));
          bufferedLines = []; // Reset the buffer after yielding
        }
        // Ignore other lines like comments or id fields
      }
    })();
  }

  private getBaseUrl(): string {
    const endpoint =
      process.env['CODE_ASSIST_ENDPOINT'] ?? CODE_ASSIST_ENDPOINT;
    const version =
      process.env['CODE_ASSIST_API_VERSION'] || CODE_ASSIST_API_VERSION;
    return `${endpoint}/${version}`;
  }

  getMethodUrl(method: string): string {
    return `${this.getBaseUrl()}:${method}`;
  }

  getOperationUrl(name: string): string {
    return `${this.getBaseUrl()}/${name}`;
  }
}

interface VpcScErrorResponse {
  response: {
    data: {
      error: {
        details: unknown[];
      };
    };
  };
}

function isVpcScErrorResponse(error: unknown): error is VpcScErrorResponse {
  return (
    !!error &&
    typeof error === 'object' &&
    'response' in error &&
    !!error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    !!error.response.data &&
    typeof error.response.data === 'object' &&
    'error' in error.response.data &&
    !!error.response.data.error &&
    typeof error.response.data.error === 'object' &&
    'details' in error.response.data.error &&
    Array.isArray(error.response.data.error.details)
  );
}

function isVpcScAffectedUser(error: unknown): boolean {
  if (isVpcScErrorResponse(error)) {
    return error.response.data.error.details.some(
      (detail: unknown) =>
        detail &&
        typeof detail === 'object' &&
        'reason' in detail &&
        detail.reason === 'SECURITY_POLICY_VIOLATED',
    );
  }
  return false;
}
