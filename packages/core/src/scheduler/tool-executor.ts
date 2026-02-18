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
import {
  MCP_QUALIFIED_NAME_SEPARATOR,
  DiscoveredMCPTool,
  DiscoveredMCPToolInvocation,
} from '../tools/mcp-tool.js';
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
              request.originalRequestName,
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
              request.originalRequestName,
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
            const displayText =
              typeof toolResult.returnDisplay === 'string'
                ? toolResult.returnDisplay
                : undefined;
            return this.createErrorResult(
              call,
              new Error(toolResult.error.message),
              toolResult.error.type,
              displayText,
              toolResult.tailToolCallRequest,
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
    const toolName = call.request.originalRequestName || call.request.name;
    const callId = call.request.callId;

    // We truncate string output for tools that can produce arbitrarily large
    // text, like shell or MCP tools.
    const isMcpTool =
      toolName.includes(MCP_QUALIFIED_NAME_SEPARATOR) ||
      call.tool instanceof DiscoveredMCPTool ||
      ('invocation' in call &&
        call.invocation instanceof DiscoveredMCPToolInvocation);
    const isShellTool = toolName === SHELL_TOOL_NAME;

    if (isShellTool || isMcpTool) {
      let contentToTruncate: string | undefined;
      if (typeof content === 'string') {
        contentToTruncate = content;
      } else if (Array.isArray(content) && content.length === 1) {
        const part = content[0];
        if (typeof part === 'string') {
          contentToTruncate = part;
        } else if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          contentToTruncate = part.text;
        }
      }

      const threshold = this.config.getTruncateToolOutputThreshold();

      if (
        contentToTruncate &&
        threshold > 0 &&
        contentToTruncate.length > threshold
      ) {
        const originalContentLength = contentToTruncate.length;
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          contentToTruncate,
          toolName,
          callId,
          this.config.storage.getProjectTempDir(),
          this.config.getSessionId(),
        );
        outputFile = savedPath;
        content = formatTruncatedToolOutput(
          contentToTruncate,
          outputFile,
          threshold,
        );

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
