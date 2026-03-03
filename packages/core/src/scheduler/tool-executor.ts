/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolResult,
  ToolResultDisplay,
  ToolLiveOutput,
} from '../tools/tools.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { logToolOutputTruncated } from '../telemetry/loggers.js';
import { ToolOutputTruncatedEvent } from '../telemetry/types.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import { truncateLongLines } from '../utils/textUtils.js';
import { DEFAULT_MAX_LINE_LENGTH } from '../utils/constants.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { executeToolWithHooks } from '../core/coreToolHookTriggers.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import { isTextPart } from '../utils/partUtils.js';
import { convertToFunctionResponse } from '../utils/generateContentResponseUtilities.js';
import type {
  CompletedToolCall,
  ToolCall,
  ExecutingToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  CancelledToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
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
  outputUpdateHandler?: (callId: string, output: ToolLiveOutput) => void;
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
        ? (outputChunk: ToolLiveOutput) => {
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

          if (signal.aborted) {
            completedToolCall = this.createCancelledResult(
              call,
              'User cancelled tool execution.',
              toolResult.returnDisplay,
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
          const isAbortError =
            executionError instanceof Error &&
            (executionError.name === 'AbortError' ||
              executionError.message.includes('Operation cancelled by user'));

          if (signal.aborted || isAbortError) {
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
    resultDisplay?: ToolResultDisplay,
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
        resultDisplay,
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
    const toolName = call.request.originalRequestName || call.request.name;
    const callId = call.request.callId;
    let content = toolResult.llmContent;
    let outputFile: string | undefined;

    if (typeof content === 'string') {
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
    } else if (
      Array.isArray(content) &&
      content.length === 1 &&
      'tool' in call &&
      call.tool instanceof DiscoveredMCPTool
    ) {
      const firstPart = content[0];
      if (isTextPart(firstPart)) {
        const textContent = firstPart.text;
        const threshold = this.config.getTruncateToolOutputThreshold();

        if (threshold > 0 && textContent.length > threshold) {
          const originalContentLength = textContent.length;
          const { outputFile: savedPath } = await saveTruncatedToolOutput(
            textContent,
            toolName,
            callId,
            this.config.storage.getProjectTempDir(),
            this.config.getSessionId(),
          );
          outputFile = savedPath;
          const truncatedText = formatTruncatedToolOutput(
            textContent,
            outputFile,
            threshold,
          );
          content[0] = { ...firstPart, text: truncatedText };

          logToolOutputTruncated(
            this.config,
            new ToolOutputTruncatedEvent(call.request.prompt_id, {
              toolName,
              originalContentLength,
              truncatedContentLength: truncatedText.length,
              threshold,
            }),
          );
        }
      }
    }

    // Final safety pass: truncate excessively long lines in every tool result (including subagents and MCP tools).
    // This acts as a universal guardrail to prevent token-limit errors.
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
    if (typeof content === 'string') {
      content = truncateLongLines(content, DEFAULT_MAX_LINE_LENGTH);
    } else if (Array.isArray(content)) {
      content = Array.from(content as unknown[]).map((part: any) => {
        if (typeof part?.text === 'string') {
          return {
            ...part,
            text: truncateLongLines(part.text, DEFAULT_MAX_LINE_LENGTH),
          };
        }
        if (typeof part?.thought === 'string') {
          return {
            ...part,
            thought: truncateLongLines(part.thought, DEFAULT_MAX_LINE_LENGTH),
          };
        }
        return part;
      });
    } else {
      const p: any = content;
      if (typeof p?.text === 'string') {
        content = {
          ...p,
          text: truncateLongLines(p.text, DEFAULT_MAX_LINE_LENGTH),
        };
      } else if (typeof p?.thought === 'string') {
        content = {
          ...p,
          thought: truncateLongLines(p.thought, DEFAULT_MAX_LINE_LENGTH),
        };
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

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
