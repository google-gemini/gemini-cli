/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolResult,
  Config,
  AnsiOutput,
} from '../index.js';
import {
  ToolErrorType,
  ToolOutputTruncatedEvent,
  logToolOutputTruncated,
  runInDevTraceSpan,
} from '../index.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { executeToolWithHooks } from '../core/coreToolHookTriggers.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import { convertToFunctionResponse } from '../utils/generateContentResponseUtilities.js';
import type {
  CompletedToolCall,
  ToolCall,
  ExecutingToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  CancelledToolCall,
} from './types.js';
import { CoreToolCallStatus } from './types.js';
import {
  GeminiCliOperation,
  GEN_AI_TOOL_CALL_ID,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
} from '../telemetry/constants.js';

export interface ToolExecutionContext {
  call: ToolCall;
  signal: AbortSignal;
  outputUpdateHandler?: (callId: string, output: string | AnsiOutput) => void;
  onUpdateToolCall: (updatedCall: ToolCall) => void;
}

export class ToolExecutor {
  constructor(private readonly config: Config) {}

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
        ? (outputChunk: string | AnsiOutput) => {
            outputUpdateHandler(callId, outputChunk);
          }
        : undefined;

    const shellExecutionConfig = this.config.getShellExecutionConfig();

    return runInDevTraceSpan(
      {
        operation: GeminiCliOperation.ToolCall,
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
          let promise: Promise<ToolResult>;
          if (invocation instanceof ShellToolInvocation) {
            const setPidCallback = (pid: number) => {
              const executingCall: ExecutingToolCall = {
                ...call,
                status: CoreToolCallStatus.Executing,
                tool,
                invocation,
                pid,
                startTime: 'startTime' in call ? call.startTime : undefined,
              };
              onUpdateToolCall(executingCall);
            };
            promise = executeToolWithHooks(
              invocation,
              toolName,
              signal,
              tool,
              liveOutputCallback,
              shellExecutionConfig,
              setPidCallback,
              this.config,
            );
          } else {
            promise = executeToolWithHooks(
              invocation,
              toolName,
              signal,
              tool,
              liveOutputCallback,
              shellExecutionConfig,
              undefined,
              this.config,
            );
          }

          const toolResult: ToolResult = await promise;

          if (signal.aborted) {
            completedToolCall = this.createCancelledResult(
              call,
              'User cancelled tool execution.',
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
            );
          }
        } catch (executionError: unknown) {
          spanMetadata.error = executionError;
          if (signal.aborted) {
            completedToolCall = this.createCancelledResult(
              call,
              'User cancelled tool execution.',
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

  private createCancelledResult(
    call: ToolCall,
    reason: string,
  ): CancelledToolCall {
    const errorMessage = `[Operation Cancelled] ${reason}`;
    const startTime = 'startTime' in call ? call.startTime : undefined;

    if (!('tool' in call) || !('invocation' in call)) {
      // This should effectively never happen in execution phase, but we handle
      // it safely
      throw new Error('Cancelled tool call missing tool/invocation references');
    }

    return {
      status: CoreToolCallStatus.Cancelled,
      request: call.request,
      response: {
        callId: call.request.callId,
        responseParts: [
          {
            functionResponse: {
              id: call.request.callId,
              name: call.request.name,
              response: { error: errorMessage },
            },
          },
        ],
        resultDisplay: undefined,
        error: undefined,
        errorType: undefined,
        contentLength: errorMessage.length,
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
    let content = toolResult.llmContent;
    let outputFile: string | undefined;
    const toolName = call.request.name;
    const callId = call.request.callId;

    if (typeof content === 'string' && toolName === SHELL_TOOL_NAME) {
      const threshold = this.config.getTruncateToolOutputThreshold();

      if (threshold > 0 && content.length > threshold) {
        const originalContentLength = content.length;
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          content,
          toolName,
          callId,
          this.config.storage.getProjectTempDir(),
          this.config.getSessionId(),
        );
        outputFile = savedPath;
        content = formatTruncatedToolOutput(content, outputFile, threshold);

        logToolOutputTruncated(
          this.config,
          new ToolOutputTruncatedEvent(call.request.prompt_id, {
            toolName,
            originalContentLength,
            truncatedContentLength: content.length,
            threshold,
          }),
        );
      }
    }

    const response = convertToFunctionResponse(
      toolName,
      callId,
      content,
      this.config.getActiveModel(),
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
    };
  }

  private createErrorResult(
    call: ToolCall,
    error: Error,
    errorType?: ToolErrorType,
    returnDisplay?: string,
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
      tool: call.tool,
      durationMs: startTime ? Date.now() - startTime : undefined,
      startTime,
      endTime: Date.now(),
      outcome: call.outcome,
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
            name: request.name,
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
