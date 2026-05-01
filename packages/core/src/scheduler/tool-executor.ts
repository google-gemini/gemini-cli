/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolErrorType,
  ToolOutputTruncatedEvent,
  logToolOutputTruncated,
  runInDevTraceSpan,
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
  type ToolResult,
  type Config,
  type AgentLoopContext,
  type ToolLiveOutput,
} from '../index.js';
import { isAbortError } from '../utils/errors.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { ToolOutputDistillationService } from '../context/toolDistillationService.js';
import { executeToolWithHooks } from '../core/coreToolHookTriggers.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import { convertToFunctionResponse } from '../utils/generateContentResponseUtilities.js';
import {
  CoreToolCallStatus,
  type CompletedToolCall,
  type ToolCall,
  type ExecutingToolCall,
  type ErroredToolCall,
  type SuccessfulToolCall,
  type CancelledToolCall,
} from './types.js';
import type { PartListUnion, Part } from '@google/genai';
import {
  GeminiCliOperation,
  GEN_AI_TOOL_CALL_ID,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
} from '../telemetry/constants.js';

export interface ToolExecutionContext {
  call: ToolCall;
  signal: AbortSignal;
  outputUpdateHandler?: (callId: string, output: ToolLiveOutput) => void;
  onUpdateToolCall: (updatedCall: ToolCall) => void;
}

export class ToolExecutor {
  constructor(private readonly context: AgentLoopContext) {}

  private get config(): Config {
    return this.context.config;
  }

  async execute(context: ToolExecutionContext): Promise<CompletedToolCall> {
    const { call, signal, outputUpdateHandler, onUpdateToolCall } = context;
    const { request } = call;
    const toolName = request.name;
    const callId = request.callId;

    if (!('tool' in call) || !call.tool || !('invocation' in call)) {
      throw new Error(
        `Cannot execute tool call ${callId}: Tool or Invocation missing.`,
      );
    }
    const { tool, invocation } = call;

    // Setup live output handling
    const liveOutputCallback =
      tool.canUpdateOutput && outputUpdateHandler
        ? (outputChunk: ToolLiveOutput) => {
            outputUpdateHandler(callId, outputChunk);
          }
        : undefined;

    const shellExecutionConfig = this.config.getShellExecutionConfig();

    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.ToolCall,
        logPrompts: this.config.getTelemetryLogPromptsEnabled(),
        tracesEnabled: this.config.getTelemetryTracesEnabled(),
        sessionId: this.config.getSessionId(),
        attributes: {
          [GEN_AI_TOOL_NAME]: toolName,
          [GEN_AI_TOOL_CALL_ID]: callId,
          [GEN_AI_TOOL_DESCRIPTION]: tool.description,
        },
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = request;

        let completedToolCall: CompletedToolCall;

        try {
          const setExecutionIdCallback = (executionId: number) => {
            const executingCall: ExecutingToolCall = {
              ...call,
              status: CoreToolCallStatus.Executing,
              tool,
              invocation,
              pid: executionId,
              startTime: 'startTime' in call ? call.startTime : undefined,
            };
            onUpdateToolCall(executingCall);
          };

          const promise = executeToolWithHooks(
            invocation,
            toolName,
            signal,
            tool,
            liveOutputCallback,
            { shellExecutionConfig, setExecutionIdCallback },
            this.config,
            request.originalRequestName,
            true, // skipBeforeHook
          );

          const toolResult: ToolResult = await promise;

          if (call.request.inputModifiedByHook) {
            const modificationMsg = `\n\n[System] Tool input parameters were modified by a hook before execution.`;
            if (typeof toolResult.llmContent === 'string') {
              toolResult.llmContent += modificationMsg;
            } else if (Array.isArray(toolResult.llmContent)) {
              toolResult.llmContent.push({ text: modificationMsg });
            } else if (toolResult.llmContent) {
              toolResult.llmContent = [
                toolResult.llmContent,
                { text: modificationMsg },
              ];
            }
          }

          if (signal.aborted) {
            completedToolCall = await this.createCancelledResult(
              call,
              'User cancelled tool execution.',
              toolResult,
            );
          } else if (toolResult.error === undefined) {
            completedToolCall = await this.createSuccessResult(
              call,
              toolResult,
            );
          } else {
            const displayText =
              typeof toolResult.returnDisplay === 'string'
                ? toolResult.returnDisplay
                : undefined;
            completedToolCall = this.createErrorResult(
              call,
              new Error(toolResult.error.message),
              toolResult.error.type,
              displayText,
              toolResult.tailToolCallRequest,
            );
          }
        } catch (executionError: unknown) {
          spanMetadata.error = executionError;
          const abortedByError =
            isAbortError(executionError) ||
            (executionError instanceof Error &&
              executionError.message.includes('Operation cancelled by user'));

          if (signal.aborted || abortedByError) {
            completedToolCall = await this.createCancelledResult(
              call,
              isAbortError(executionError)
                ? 'Operation cancelled.'
                : 'User cancelled tool execution.',
            );
          } else {
            const error =
              executionError instanceof Error
                ? executionError
                : new Error(String(executionError));
            completedToolCall = this.createErrorResult(
              call,
              error,
              ToolErrorType.UNHANDLED_EXCEPTION,
            );
          }
        }

        spanMetadata.output = completedToolCall;
        return completedToolCall;
      },
    );
  }

  private async truncateOutputIfNeeded(
    call: ToolCall,
    content: PartListUnion,
  ): Promise<{ truncatedContent: PartListUnion; outputFile?: string }> {
    if (this.config.isContextManagementEnabled()) {
      const distiller = new ToolOutputDistillationService(
        this.config,
        this.context.geminiClient,
        this.context.promptId,
      );
      return distiller.distill(call.request.name, call.request.callId, content);
    }

    const toolName = call.request.name;
    const callId = call.request.callId;
    let outputFile: string | undefined;

    if (typeof content === 'string' && toolName === SHELL_TOOL_NAME) {
      const threshold = this.config.getTruncateToolOutputThreshold();

      if (threshold > 0 && content.length > threshold) {
        const originalContentLength = content.length;
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          content,
          toolName,
          callId,
          this.config.storage.getProjectTempDir(),
          this.context.promptId,
        );
        outputFile = savedPath;
        const truncatedContent = formatTruncatedToolOutput(
          content,
          outputFile,
          threshold,
        );

        logToolOutputTruncated(
          this.config,
          new ToolOutputTruncatedEvent(call.request.prompt_id, {
            toolName,
            originalContentLength,
            truncatedContentLength: truncatedContent.length,
            threshold,
          }),
        );

        return { truncatedContent, outputFile };
      }
    } else if (
      Array.isArray(content) &&
      content.length === 1 &&
      'tool' in call &&
      call.tool instanceof DiscoveredMCPTool
    ) {
      const firstPart = content[0];
      if (typeof firstPart === 'object' && typeof firstPart.text === 'string') {
        const textContent = firstPart.text;
        const threshold = this.config.getTruncateToolOutputThreshold();

        if (threshold > 0 && textContent.length > threshold) {
          const originalContentLength = textContent.length;
          const { outputFile: savedPath } = await saveTruncatedToolOutput(
            textContent,
            toolName,
            callId,
            this.config.storage.getProjectTempDir(),
            this.context.promptId,
          );
          outputFile = savedPath;
          const truncatedText = formatTruncatedToolOutput(
            textContent,
            outputFile,
            threshold,
          );

          // We need to return a NEW array to avoid mutating the original toolResult if it matters,
          // though here we are creating the response so it's probably fine to mutate or return new.
          const truncatedContent: Part[] = [
            { ...firstPart, text: truncatedText },
          ];

          logToolOutputTruncated(
            this.config,
            new ToolOutputTruncatedEvent(call.request.prompt_id, {
              toolName,
              originalContentLength,
              truncatedContentLength: truncatedText.length,
              threshold,
            }),
          );

          return { truncatedContent, outputFile };
        }
      }
    }

    return { truncatedContent: content, outputFile };
  }

  private async createCancelledResult(
    call: ToolCall,
    reason: string,
    toolResult?: ToolResult,
  ): Promise<CancelledToolCall> {
    const errorMessage = `[Operation Cancelled] ${reason}`;
    const startTime = 'startTime' in call ? call.startTime : undefined;

    if (!('tool' in call) || !('invocation' in call)) {
      // This should effectively never happen in execution phase, but we handle
      // it safely
      throw new Error('Cancelled tool call missing tool/invocation references');
    }

    let responseParts: Part[] = [];
    let outputFile: string | undefined;

    if (toolResult?.llmContent) {
      // Attempt to truncate and save output if we have content, even in cancellation case
      // This is to handle cases where the tool may have produced output before cancellation
      const { truncatedContent: output, outputFile: truncatedOutputFile } =
        await this.truncateOutputIfNeeded(call, toolResult?.llmContent);

      outputFile = truncatedOutputFile;
      responseParts = convertToFunctionResponse(
        call.request.originalRequestName ?? call.request.name,
        call.request.callId,
        output,
        this.config.getActiveModel(),
        this.config,
      );

      // Inject the cancellation error into the response object
      const mainPart = responseParts[0];
      if (mainPart?.functionResponse?.response) {
        const respObj = mainPart.functionResponse.response;
        respObj['error'] = errorMessage;
      }
    } else {
      responseParts = [
        {
          functionResponse: {
            id: call.request.callId,
            name: call.request.originalRequestName ?? call.request.name,
            response: { error: errorMessage },
          },
        },
      ];
    }

    return {
      status: CoreToolCallStatus.Cancelled,
      request: call.request,
      response: {
        callId: call.request.callId,
        responseParts,
        resultDisplay: toolResult?.returnDisplay,
        error: undefined,
        errorType: undefined,
        outputFile,
        contentLength: JSON.stringify(responseParts).length,
      },
      tool: call.tool,
      invocation: call.invocation,
      durationMs: startTime ? Date.now() - startTime : undefined,
      startTime,
      endTime: Date.now(),
      outcome: call.outcome,
    };
  }

  private async createSuccessResult(
    call: ToolCall,
    toolResult: ToolResult,
  ): Promise<SuccessfulToolCall> {
    const { truncatedContent: content, outputFile } =
      await this.truncateOutputIfNeeded(call, toolResult.llmContent);

    const toolName = call.request.originalRequestName || call.request.name;
    const callId = call.request.callId;

    const response = convertToFunctionResponse(
      toolName,
      callId,
      content,
      this.config.getActiveModel(),
      this.config,
    );

    const successResponse: ToolCallResponseInfo = {
      callId,
      responseParts: response,
      resultDisplay: toolResult.returnDisplay,
      error: undefined,
      errorType: undefined,
      outputFile,
      contentLength: typeof content === 'string' ? content.length : undefined,
      data: toolResult.data,
    };

    const startTime = 'startTime' in call ? call.startTime : undefined;
    // Ensure we have tool and invocation
    if (!('tool' in call) || !('invocation' in call)) {
      throw new Error('Successful tool call missing tool or invocation');
    }

    return {
      status: CoreToolCallStatus.Success,
      request: call.request,
      tool: call.tool,
      response: successResponse,
      invocation: call.invocation,
      durationMs: startTime ? Date.now() - startTime : undefined,
      startTime,
      endTime: Date.now(),
      outcome: call.outcome,
      tailToolCallRequest: toolResult.tailToolCallRequest,
    };
  }

  private createErrorResult(
    call: ToolCall,
    error: Error,
    errorType?: ToolErrorType,
    returnDisplay?: string,
    tailToolCallRequest?: { name: string; args: Record<string, unknown> },
  ): ErroredToolCall {
    const response = this.createErrorResponse(
      call.request,
      error,
      errorType,
      returnDisplay,
    );
    const startTime = 'startTime' in call ? call.startTime : undefined;

    return {
      status: CoreToolCallStatus.Error,
      request: call.request,
      response,
      tool: 'tool' in call ? call.tool : undefined,
      durationMs: startTime ? Date.now() - startTime : undefined,
      startTime,
      endTime: Date.now(),
      outcome: call.outcome,
      tailToolCallRequest,
    };
  }

  private createErrorResponse(
    request: ToolCallRequestInfo,
    error: Error,
    errorType: ToolErrorType | undefined,
    returnDisplay?: string,
  ): ToolCallResponseInfo {
    const displayText = returnDisplay ?? error.message;
    return {
      callId: request.callId,
      error,
      responseParts: [
        {
          functionResponse: {
            id: request.callId,
            name: request.originalRequestName || request.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: displayText,
      errorType,
      contentLength: displayText.length,
    };
  }
}
