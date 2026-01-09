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
import { saveTruncatedContent } from '../utils/fileUtils.js';
import { convertToFunctionResponse } from '../utils/generateContentResponseUtilities.js';
import type {
  CompletedToolCall,
  ToolCall,
  ExecutingToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  CancelledToolCall,
} from './types.js';

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
    const hooksEnabled = this.config.getEnableHooks();
    const messageBus = this.config.getMessageBus();

    return runInDevTraceSpan(
      {
        name: tool.name,
        attributes: { type: 'tool-call' },
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = { request };

        try {
          let promise: Promise<ToolResult>;
          if (invocation instanceof ShellToolInvocation) {
            const setPidCallback = (pid: number) => {
              const executingCall: ExecutingToolCall = {
                ...call,
                status: 'executing',
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
              messageBus,
              hooksEnabled,
              tool,
              liveOutputCallback,
              shellExecutionConfig,
              setPidCallback,
              this.config,
              call.inputModification,
            );
          } else {
            promise = executeToolWithHooks(
              invocation,
              toolName,
              signal,
              messageBus,
              hooksEnabled,
              tool,
              liveOutputCallback,
              shellExecutionConfig,
              undefined,
              this.config,
              call.inputModification,
            );
          }

          const toolResult: ToolResult = await promise;
          spanMetadata.output = toolResult;

          if (signal.aborted) {
            return this.createCancelledResult(
              call,
              'User cancelled tool execution.',
            );
          } else if (toolResult.error === undefined) {
            return await this.createSuccessResult(call, toolResult);
          } else {
            return this.createErrorResult(
              call,
              new Error(toolResult.error.message),
              toolResult.error.type,
            );
          }
        } catch (executionError: unknown) {
          spanMetadata.error = executionError;
          if (signal.aborted) {
            return this.createCancelledResult(
              call,
              'User cancelled tool execution.',
            );
          }
          const error =
            executionError instanceof Error
              ? executionError
              : new Error(String(executionError));
          return this.createErrorResult(
            call,
            error,
            ToolErrorType.UNHANDLED_EXCEPTION,
          );
        }
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
      status: 'cancelled',
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

    if (
      typeof content === 'string' &&
      toolName === SHELL_TOOL_NAME &&
      this.config.getEnableToolOutputTruncation() &&
      this.config.getTruncateToolOutputThreshold() > 0 &&
      this.config.getTruncateToolOutputLines() > 0
    ) {
      const originalContentLength = content.length;
      const threshold = this.config.getTruncateToolOutputThreshold();
      const lines = this.config.getTruncateToolOutputLines();
      const truncatedResult = await saveTruncatedContent(
        content,
        callId,
        this.config.storage.getProjectTempDir(),
        threshold,
        lines,
      );
      content = truncatedResult.content;
      outputFile = truncatedResult.outputFile;

      if (outputFile) {
        logToolOutputTruncated(
          this.config,
          new ToolOutputTruncatedEvent(call.request.prompt_id, {
            toolName,
            originalContentLength,
            truncatedContentLength: content.length,
            threshold,
            lines,
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
    };

    const startTime = 'startTime' in call ? call.startTime : undefined;
    // Ensure we have tool and invocation
    if (!('tool' in call) || !('invocation' in call)) {
      throw new Error('Successful tool call missing tool or invocation');
    }

    return {
      status: 'success',
      request: call.request,
      tool: call.tool,
      response: successResponse,
      invocation: call.invocation,
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    };
  }

  private createErrorResult(
    call: ToolCall,
    error: Error,
    errorType?: ToolErrorType,
  ): ErroredToolCall {
    const response = this.createErrorResponse(call.request, error, errorType);
    const startTime = 'startTime' in call ? call.startTime : undefined;

    return {
      status: 'error',
      request: call.request,
      response,
      tool: call.tool,
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    };
  }

  private createErrorResponse(
    request: ToolCallRequestInfo,
    error: Error,
    errorType: ToolErrorType | undefined,
  ): ToolCallResponseInfo {
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
      resultDisplay: error.message,
      errorType,
      contentLength: error.message.length,
    };
  }
}
