/**
 * @license
 * Copyright 2026 Google LLC
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
import type { ServerDetails, ContextBreakdown } from '../telemetry/types.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { Config } from '../config/config.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
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
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorType } from '../utils/errors.js';
import {
  GeminiCliOperation,
  GEN_AI_PROMPT_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '../telemetry/constants.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import { isMcpToolName } from '../tools/mcp-tool.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

interface StructuredError {
  status: number;
}

/**
 * Rough token estimate for non-Part config objects (tool definitions, etc.)
 * where estimateTokenCountSync cannot be used directly.
 */
function estimateConfigTokens(value: unknown): number {
  return Math.floor(JSON.stringify(value).length / 4);
}

/**
 * Estimates the context breakdown for telemetry. All returned fields are
 * additive (non-overlapping), so their sum approximates the total context size.
 *
 * - system_instructions: tokens from system instruction config
 * - tool_definitions: tokens from non-MCP tool definitions
 * - history: tokens from conversation history, excluding tool call/response parts
 * - tool_calls: per-tool token counts for non-MCP function call + response parts
 * - mcp_servers: tokens from MCP tool definitions + MCP tool call/response parts
 *
 * MCP tool calls are excluded from tool_calls and counted only in mcp_servers
 * to keep fields non-overlapping and avoid leaking MCP server names in telemetry.
 */
export function estimateContextBreakdown(
  contents: Content[],
  config?: GenerateContentConfig,
): ContextBreakdown {
  let systemInstructions = 0;
  let toolDefinitions = 0;
  let history = 0;
  let mcpServers = 0;
  const toolCalls: Record<string, number> = {};

  if (config?.systemInstruction) {
    systemInstructions += estimateConfigTokens(config.systemInstruction);
  }

  if (config?.tools) {
    for (const tool of config.tools) {
      const toolTokens = estimateConfigTokens(tool);
      if (
        tool &&
        typeof tool === 'object' &&
        'functionDeclarations' in tool &&
        tool.functionDeclarations
      ) {
        let mcpTokensInTool = 0;
        for (const func of tool.functionDeclarations) {
          if (func.name && isMcpToolName(func.name)) {
            mcpTokensInTool += estimateConfigTokens(func);
          }
        }
        mcpServers += mcpTokensInTool;
        toolDefinitions += toolTokens - mcpTokensInTool;
      } else {
        toolDefinitions += toolTokens;
      }
    }
  }

  for (const content of contents) {
    for (const part of content.parts || []) {
      if (part.functionCall) {
        const name = part.functionCall.name || 'unknown';
        const tokens = estimateTokenCountSync([part]);
        if (isMcpToolName(name)) {
          mcpServers += tokens;
        } else {
          toolCalls[name] = (toolCalls[name] || 0) + tokens;
        }
      } else if (part.functionResponse) {
        const name = part.functionResponse.name || 'unknown';
        const tokens = estimateTokenCountSync([part]);
        if (isMcpToolName(name)) {
          mcpServers += tokens;
        } else {
          toolCalls[name] = (toolCalls[name] || 0) + tokens;
        }
      } else {
        history += estimateTokenCountSync([part]);
      }
    }
  }

  return {
    system_instructions: systemInstructions,
    tool_definitions: toolDefinitions,
    history,
    tool_calls: toolCalls,
    mcp_servers: mcpServers,
  };
}

export class LoggingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {}

  getWrapped(): ContentGenerator {
    return this.wrapped;
  }

  get userTier(): UserTierId | undefined {
    return this.wrapped.userTier;
  }

  get userTierName(): string | undefined {
    return this.wrapped.userTierName;
  }

  get paidTier(): GeminiUserTier | undefined {
    return this.wrapped.paidTier;
  }

  private logApiRequest(
    contents: Content[],
    model: string,
    promptId: string,
    role: LlmRole,
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
        role,
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
    role: LlmRole,
    responseId: string | undefined,
    responseCandidates?: Candidate[],
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const event = new ApiResponseEvent(
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
      role,
    );

    // Only compute context breakdown for turn-ending responses (when the user
    // gets back control to type). If the response contains function calls, the
    // model is in a tool-use loop and will make more API calls — skip to avoid
    // emitting redundant cumulative snapshots for every intermediate step.
    const hasToolCalls = responseCandidates?.some((c) =>
      c.content?.parts?.some((p) => p.functionCall),
    );
    if (!hasToolCalls) {
      event.usage.context_breakdown = estimateContextBreakdown(
        requestContents,
        generationConfig,
      );
    }

    logApiResponse(this.config, event);
  }

  private _fixGaxiosErrorData(error: unknown): void {
    // Fix for raw ASCII buffer strings appearing in dev with the latest
    // Gaxios updates.
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'data' in error.response
    ) {
      const response = error.response as { data: unknown };
      const data = response.data;
      if (typeof data === 'string' && data.includes(',')) {
        try {
          const charCodes = data.split(',').map(Number);
          if (charCodes.every((code) => !isNaN(code))) {
            response.data = String.fromCharCode(...charCodes);
          }
        } catch (_e) {
          // If parsing fails, just leave it alone
        }
      }
    }
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    model: string,
    prompt_id: string,
    requestContents: Content[],
    role: LlmRole,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = getErrorType(error);

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
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (error as StructuredError).status
          : undefined,
        role,
      ),
    );
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        attributes: {
          [GEN_AI_REQUEST_MODEL]: req.model,
          [GEN_AI_PROMPT_NAME]: userPromptId,
          [GEN_AI_SYSTEM_INSTRUCTIONS]: safeJsonStringify(
            req.config?.systemInstruction ?? [],
          ),
          [GEN_AI_TOOL_DEFINITIONS]: safeJsonStringify(req.config?.tools ?? []),
        },
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = req.contents;

        const startTime = Date.now();
        const contents: Content[] = toContents(req.contents);
        const serverDetails = this._getEndpointUrl(req, 'generateContent');
        this.logApiRequest(
          contents,
          req.model,
          userPromptId,
          role,
          req.config,
          serverDetails,
        );

        try {
          const response = await this.wrapped.generateContent(
            req,
            userPromptId,
            role,
          );
          spanMetadata.output = response.candidates?.[0]?.content ?? null;
          spanMetadata.attributes[GEN_AI_USAGE_INPUT_TOKENS] =
            response.usageMetadata?.promptTokenCount ?? 0;
          spanMetadata.attributes[GEN_AI_USAGE_OUTPUT_TOKENS] =
            response.usageMetadata?.candidatesTokenCount ?? 0;
          const durationMs = Date.now() - startTime;
          this._logApiResponse(
            contents,
            durationMs,
            response.modelVersion || req.model,
            userPromptId,
            role,
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
          this.config
            .refreshUserQuotaIfStale()
            .catch((e) => debugLogger.debug('quota refresh failed', e));
          return response;
        } catch (error) {
          spanMetadata.error = error;
          const durationMs = Date.now() - startTime;

          this._fixGaxiosErrorData(error);

          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            contents,
            role,
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
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        noAutoEnd: true,
        attributes: {
          [GEN_AI_REQUEST_MODEL]: req.model,
          [GEN_AI_PROMPT_NAME]: userPromptId,
          [GEN_AI_SYSTEM_INSTRUCTIONS]: safeJsonStringify(
            req.config?.systemInstruction ?? [],
          ),
          [GEN_AI_TOOL_DEFINITIONS]: safeJsonStringify(req.config?.tools ?? []),
        },
      },
      async ({ metadata: spanMetadata, endSpan }) => {
        spanMetadata.input = req.contents;

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
          role,
          req.config,
          serverDetails,
        );

        let stream: AsyncGenerator<GenerateContentResponse>;
        try {
          stream = await this.wrapped.generateContentStream(
            req,
            userPromptId,
            role,
          );
        } catch (error) {
          const durationMs = Date.now() - startTime;

          this._fixGaxiosErrorData(error);

          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            toContents(req.contents),
            role,
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
          role,
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
    role: LlmRole,
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
        role,
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
      this.config
        .refreshUserQuotaIfStale()
        .catch((e) => debugLogger.debug('quota refresh failed', e));
      spanMetadata.output = responses.map(
        (response) => response.candidates?.[0]?.content ?? null,
      );
      if (lastUsageMetadata) {
        spanMetadata.attributes[GEN_AI_USAGE_INPUT_TOKENS] =
          lastUsageMetadata.promptTokenCount ?? 0;
        spanMetadata.attributes[GEN_AI_USAGE_OUTPUT_TOKENS] =
          lastUsageMetadata.candidatesTokenCount ?? 0;
      }
    } catch (error) {
      spanMetadata.error = error;
      const durationMs = Date.now() - startTime;
      this._logApiError(
        durationMs,
        error,
        responses[0]?.modelVersion || req.model,
        userPromptId,
        requestContents,
        role,
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
        operation: GeminiCliOperation.LLMCall,
        attributes: {
          [GEN_AI_REQUEST_MODEL]: req.model,
        },
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = req.contents;
        const output = await this.wrapped.embedContent(req);
        spanMetadata.output = output;
        return output;
      },
    );
  }
}
