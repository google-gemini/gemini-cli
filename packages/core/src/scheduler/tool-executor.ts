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
import type { PartListUnion, Part } from '@google/genai';

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
          spanMetadata.output = toolResult;

          if (signal.aborted) {
            return await this.createCancelledResult(
              call,
              'User cancelled tool execution.',
              toolResult,
            );
          } else if (toolResult.error === undefined) {
            return await this.createSuccessResult(call, toolResult);
          } else {
            const displayText =
              typeof toolResult.returnDisplay === 'string'
                ? toolResult.returnDisplay
                : undefined;
            return this.createErrorResult(
              call,
              new Error(toolResult.error.message),
              toolResult.error.type,
              displayText,
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

  private async truncateOutputIfNeeded(
    call: ToolCall,
    content: PartListUnion,
  ): Promise<{ truncatedContent: PartListUnion; outputFile?: string }> {
    if (typeof content !== 'string' || call.request.name !== SHELL_TOOL_NAME) {
      return { truncatedContent: content };
    }

    const threshold = this.config.getTruncateToolOutputThreshold();
    if (threshold <= 0 || content.length <= threshold) {
      return { truncatedContent: content };
    }

    const toolName = call.request.name;
    const callId = call.request.callId;
    const originalContentLength = content.length;

    const { outputFile } = await saveTruncatedToolOutput(
      content,
      toolName,
      callId,
      this.config.storage.getProjectTempDir(),
      this.config.getSessionId(),
    );

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
        call.request.name,
        call.request.callId,
        output,
        this.config.getActiveModel(),
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
            name: call.request.name,
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
        resultDisplay:
          typeof toolResult?.returnDisplay === 'string'
            ? toolResult.returnDisplay
            : undefined,
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

    const toolName = call.request.name;
    const callId = call.request.callId;

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
