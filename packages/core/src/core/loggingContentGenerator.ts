/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Candidate,
  Content,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponseUsageMetadata,
  GenerateContentResponse,
} from '@google/genai';
import type { ServerDetails } from '../telemetry/types.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';
import type { Config } from '../config/config.js';
import {
  logApiError,
  logApiRequest,
  logApiResponse,
} from '../telemetry/loggers.js';
import type { ContentGenerator } from './contentGenerator.js';
import { CodeAssistServer } from '../code_assist/server.js';
import { toContents } from '../code_assist/converter.js';
import { isStructuredError } from '../utils/quotaErrorDetection.js';
import { runInDevTraceSpan, type SpanMetadata } from '../telemetry/trace.js';

interface StructuredError {
  status: number;
}

/**
 * A decorator that wraps a ContentGenerator to add logging to API calls.
 */
export class LoggingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {}

  getWrapped(): ContentGenerator {
    return this.wrapped;
  }

  private logApiRequest(
    contents: Content[],
    model: string,
    promptId: string,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const requestText = JSON.stringify(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(
        model,
        {
          prompt_id: promptId,
          contents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        requestText,
      ),
    );
  }

  private _getEndpointUrl(
    req: GenerateContentParameters,
    method: 'generateContent' | 'generateContentStream',
  ): ServerDetails {
    // Case 1: Authenticated with a Google account (`gcloud auth login`).
    // Requests are routed through the internal CodeAssistServer.
    if (this.wrapped instanceof CodeAssistServer) {
      const url = new URL(this.wrapped.getMethodUrl(method));
      const port = url.port
        ? parseInt(url.port, 10)
        : url.protocol === 'https:'
          ? 443
          : 80;
      return { address: url.hostname, port };
    }

    const genConfig = this.config.getContentGeneratorConfig();

    // Case 2: Using an API key for Vertex AI.
    if (genConfig?.vertexai) {
      const location = process.env['GOOGLE_CLOUD_LOCATION'];
      if (location) {
        return { address: `${location}-aiplatform.googleapis.com`, port: 443 };
      } else {
        return { address: 'unknown', port: 0 };
      }
    }

    // Case 3: Default to the public Gemini API endpoint.
    // This is used when an API key is provided but not for Vertex AI.
    return { address: `generativelanguage.googleapis.com`, port: 443 };
  }

  private _logApiResponse(
    requestContents: Content[],
    durationMs: number,
    model: string,
    prompt_id: string,
    responseId: string | undefined,
    responseCandidates?: Candidate[],
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        model,
        durationMs,
        {
          prompt_id,
          contents: requestContents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        {
          candidates: responseCandidates,
          response_id: responseId,
        },
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    model: string,
    prompt_id: string,
    requestContents: Content[],
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        model,
        errorMessage,
        durationMs,
        {
          prompt_id,
          contents: requestContents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
        isStructuredError(error)
          ? (error as StructuredError).status
          : undefined,
      ),
    );
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return runInDevTraceSpan(
      {
        name: 'generateContent',
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = { request: req, userPromptId, model: req.model };

        const startTime = Date.now();
        const contents: Content[] = toContents(req.contents);
        const serverDetails = this._getEndpointUrl(req, 'generateContent');
        this.logApiRequest(
          contents,
          req.model,
          userPromptId,
          req.config,
          serverDetails,
        );

        try {
          const response = await this.wrapped.generateContent(
            req,
            userPromptId,
          );
          spanMetadata.output = {
            response,
            usageMetadata: response.usageMetadata,
          };
          const durationMs = Date.now() - startTime;
          this._logApiResponse(
            contents,
            durationMs,
            response.modelVersion || req.model,
            userPromptId,
            response.responseId,
            response.candidates,
            response.usageMetadata,
            JSON.stringify({
              candidates: response.candidates,
              usageMetadata: response.usageMetadata,
              responseId: response.responseId,
              modelVersion: response.modelVersion,
              promptFeedback: response.promptFeedback,
            }),
            req.config,
            serverDetails,
          );
          return response;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            contents,
            req.config,
            serverDetails,
          );
          throw error;
        }
      },
    );
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return runInDevTraceSpan(
      {
        name: 'generateContentStream',
        noAutoEnd: true,
      },
      async ({ metadata: spanMetadata, endSpan }) => {
        spanMetadata.input = { request: req, userPromptId, model: req.model };
        const startTime = Date.now();
        const serverDetails = this._getEndpointUrl(
          req,
          'generateContentStream',
        );

        // For debugging: Capture the latest main agent request payload.
        // Main agent prompt IDs end with exactly 8 hashes and a turn counter (e.g. "...########1")
        if (/########\d+$/.test(userPromptId)) {
          this.config.setLatestApiRequest(req);
        }

        this.logApiRequest(
          toContents(req.contents),
          req.model,
          userPromptId,
          req.config,
          serverDetails,
        );

        let stream: AsyncGenerator<GenerateContentResponse>;
        try {
          stream = await this.wrapped.generateContentStream(req, userPromptId);
        } catch (error) {
          const durationMs = Date.now() - startTime;
          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            toContents(req.contents),
            req.config,
            serverDetails,
          );
          throw error;
        }

        return this.loggingStreamWrapper(
          req,
          stream,
          startTime,
          userPromptId,
          spanMetadata,
          endSpan,
        );
      },
    );
  }

  private async *loggingStreamWrapper(
    req: GenerateContentParameters,
    stream: AsyncGenerator<GenerateContentResponse>,
    startTime: number,
    userPromptId: string,
    spanMetadata: SpanMetadata,
    endSpan: () => void,
  ): AsyncGenerator<GenerateContentResponse> {
    const responses: GenerateContentResponse[] = [];

    let lastUsageMetadata: GenerateContentResponseUsageMetadata | undefined;
    const serverDetails = this._getEndpointUrl(req, 'generateContentStream');
    const requestContents: Content[] = toContents(req.contents);
    try {
      for await (const response of stream) {
        responses.push(response);
        if (response.usageMetadata) {
          lastUsageMetadata = response.usageMetadata;
        }
        yield response;
      }
      // Only log successful API response if no error occurred
      const durationMs = Date.now() - startTime;
      this._logApiResponse(
        requestContents,
        durationMs,
        responses[0]?.modelVersion || req.model,
        userPromptId,
        responses[0]?.responseId,
        responses.flatMap((response) => response.candidates || []),
        lastUsageMetadata,
        JSON.stringify(
          responses.map((r) => ({
            candidates: r.candidates,
            usageMetadata: r.usageMetadata,
            responseId: r.responseId,
            modelVersion: r.modelVersion,
            promptFeedback: r.promptFeedback,
          })),
        ),
        req.config,
        serverDetails,
      );
      spanMetadata.output = {
        streamChunks: responses.map((r) => ({
          content: r.candidates?.[0]?.content ?? null,
        })),
        usageMetadata: lastUsageMetadata,
        durationMs,
      };
    } catch (error) {
      spanMetadata.error = error;
      const durationMs = Date.now() - startTime;
      this._logApiError(
        durationMs,
        error,
        responses[0]?.modelVersion || req.model,
        userPromptId,
        requestContents,
        req.config,
        serverDetails,
      );
      throw error;
    } finally {
      endSpan();
    }
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return runInDevTraceSpan(
      {
        name: 'embedContent',
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = { request: req };
        const output = await this.wrapped.embedContent(req);
        spanMetadata.output = output;
        return output;
      },
    );
  }
}
