/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
  EditorType,
  Config,
  ToolConfirmationPayload,
  AnyDeclarativeTool,
  AnyToolInvocation,
  AnsiOutput,
} from '../index.js';
import {
  ToolConfirmationOutcome,
  ApprovalMode,
  logToolCall,
  ToolErrorType,
  ToolCallEvent,
  logToolOutputTruncated,
  ToolOutputTruncatedEvent,
  runInDevTraceSpan,
} from '../index.js';
import { READ_FILE_TOOL_NAME, SHELL_TOOL_NAME } from '../tools/tool-names.js';
import type { Part, PartListUnion } from '@google/genai';
import { getResponseTextFromParts } from '../utils/generateContentResponseUtilities.js';
import type { ModifyContext } from '../tools/modifiable-tool.js';
import {
  isModifiableDeclarativeTool,
  modifyWithEditor,
} from '../tools/modifiable-tool.js';
import * as Diff from 'diff';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  isShellInvocationAllowlisted,
  SHELL_TOOL_NAMES,
} from '../utils/shell-utils.js';
import { doesToolInvocationMatch } from '../utils/tool-utils.js';
import levenshtein from 'fast-levenshtein';
import { ShellToolInvocation } from '../tools/shell.js';
import type { ToolConfirmationRequest } from '../confirmation-bus/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  fireToolNotificationHook,
  executeToolWithHooks,
} from './coreToolHookTriggers.js';

export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool?: AnyDeclarativeTool;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  response: ToolCallResponseInfo;
  invocation: AnyToolInvocation;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  liveOutput?: string | AnsiOutput;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
  pid?: number;
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  durationMs?: number;
  outcome?: ToolConfirmationOutcome;
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: AnyDeclarativeTool;
  invocation: AnyToolInvocation;
  confirmationDetails: ToolCallConfirmationDetails;
  startTime?: number;
  outcome?: ToolConfirmationOutcome;
};

export type Status = ToolCall['status'];

export type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | ErroredToolCall
  | SuccessfulToolCall
  | ExecutingToolCall
  | CancelledToolCall
  | WaitingToolCall;

export type CompletedToolCall =
  | SuccessfulToolCall
  | CancelledToolCall
  | ErroredToolCall;

export type ConfirmHandler = (
  toolCall: WaitingToolCall,
) => Promise<ToolConfirmationOutcome>;

export type OutputUpdateHandler = (
  toolCallId: string,
  outputChunk: string | AnsiOutput,
) => void;

export type AllToolCallsCompleteHandler = (
  completedToolCalls: CompletedToolCall[],
) => Promise<void>;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;

/**
 * Formats tool output for a Gemini FunctionResponse.
 */
function createFunctionResponsePart(
  callId: string,
  toolName: string,
  output: string,
): Part {
  return {
    functionResponse: {
      id: callId,
      name: toolName,
      response: { output },
    },
  };
}

export function convertToFunctionResponse(
  toolName: string,
  callId: string,
  llmContent: PartListUnion,
): Part[] {
  const contentToProcess =
    Array.isArray(llmContent) && llmContent.length === 1
      ? llmContent[0]
      : llmContent;

  if (typeof contentToProcess === 'string') {
    return [createFunctionResponsePart(callId, toolName, contentToProcess)];
  }

  if (Array.isArray(contentToProcess)) {
    const functionResponse = createFunctionResponsePart(
      callId,
      toolName,
      'Tool execution succeeded.',
    );
    return [functionResponse, ...toParts(contentToProcess)];
  }

  // After this point, contentToProcess is a single Part object.
  if (contentToProcess.functionResponse) {
    if (contentToProcess.functionResponse.response?.['content']) {
      const stringifiedOutput =
        getResponseTextFromParts(
          contentToProcess.functionResponse.response['content'] as Part[],
        ) || '';
      return [createFunctionResponsePart(callId, toolName, stringifiedOutput)];
    }
    // It's a functionResponse that we should pass through as is.
    return [contentToProcess];
  }

  if (contentToProcess.inlineData || contentToProcess.fileData) {
    const mimeType =
      contentToProcess.inlineData?.mimeType ||
      contentToProcess.fileData?.mimeType ||
      'unknown';
    const functionResponse = createFunctionResponsePart(
      callId,
      toolName,
      `Binary content of type ${mimeType} was processed.`,
    );
    return [functionResponse, contentToProcess];
  }

  if (contentToProcess.text !== undefined) {
    return [
      createFunctionResponsePart(callId, toolName, contentToProcess.text),
    ];
  }

  // Default case for other kinds of parts.
  return [
    createFunctionResponsePart(callId, toolName, 'Tool execution succeeded.'),
  ];
}

function toParts(input: PartListUnion): Part[] {
  const parts: Part[] = [];
  for (const part of Array.isArray(input) ? input : [input]) {
    if (typeof part === 'string') {
      parts.push({ text: part });
    } else if (part) {
      parts.push(part);
    }
  }
  return parts;
}

const createErrorResponse = (
  request: ToolCallRequestInfo,
  error: Error,
  errorType: ToolErrorType | undefined,
): ToolCallResponseInfo => ({
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
});

export async function truncateAndSaveToFile(
  content: string,
  callId: string,
  projectTempDir: string,
  threshold: number,
  truncateLines: number,
): Promise<{ content: string; outputFile?: string }> {
  if (content.length <= threshold) {
    return { content };
  }

  let lines = content.split('\n');
  let fileContent = content;

  // If the content is long but has few lines, wrap it to enable line-based truncation.
  if (lines.length <= truncateLines) {
    const wrapWidth = 120; // A reasonable width for wrapping.
    const wrappedLines: string[] = [];
    for (const line of lines) {
      if (line.length > wrapWidth) {
        for (let i = 0; i < line.length; i += wrapWidth) {
          wrappedLines.push(line.substring(i, i + wrapWidth));
        }
      } else {
        wrappedLines.push(line);
      }
    }
    lines = wrappedLines;
    fileContent = lines.join('\n');
  }

  const head = Math.floor(truncateLines / 5);
  const beginning = lines.slice(0, head);
  const end = lines.slice(-(truncateLines - head));
  const truncatedContent =
    beginning.join('\n') + '\n... [CONTENT TRUNCATED] ...\n' + end.join('\n');

  // Sanitize callId to prevent path traversal.
  const safeFileName = `${path.basename(callId)}.output`;
  const outputFile = path.join(projectTempDir, safeFileName);
  try {
    await fs.writeFile(outputFile, fileContent);

    return {
      content: `Tool output was too large and has been truncated.
The full output has been saved to: ${outputFile}
To read the complete output, use the ${READ_FILE_TOOL_NAME} tool with the absolute file path above. For large files, you can use the offset and limit parameters to read specific sections:
- ${READ_FILE_TOOL_NAME} tool with offset=0, limit=100 to see the first 100 lines
- ${READ_FILE_TOOL_NAME} tool with offset=N to skip N lines from the beginning
- ${READ_FILE_TOOL_NAME} tool with limit=M to read only M lines at a time
The truncated output below shows the beginning and end of the content. The marker '... [CONTENT TRUNCATED] ...' indicates where content was removed.
This allows you to efficiently examine different parts of the output without loading the entire file.
Truncated part of the output:
${truncatedContent}`,
      outputFile,
    };
  } catch (_error) {
    return {
      content:
        truncatedContent + `\n[Note: Could not save full output to file]`,
    };
  }
}

interface CoreToolSchedulerOptions {
  config: Config;
  outputUpdateHandler?: OutputUpdateHandler;
  onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  onToolCallsUpdate?: ToolCallsUpdateHandler;
  getPreferredEditor: () => EditorType | undefined;
}

export class CoreToolScheduler {
  // Static WeakMap to track which MessageBus instances already have a handler subscribed
  // This prevents duplicate subscriptions when multiple CoreToolScheduler instances are created
  private static subscribedMessageBuses = new WeakMap<
    MessageBus,
    (request: ToolConfirmationRequest) => void
  >();

  private toolCalls: ToolCall[] = [];
  private outputUpdateHandler?: OutputUpdateHandler;
  private onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  private onToolCallsUpdate?: ToolCallsUpdateHandler;
  private getPreferredEditor: () => EditorType | undefined;
  private config: Config;
  private isFinalizingToolCalls = false;
  private isScheduling = false;
  private isCancelling = false;
  private requestQueue: Array<{
    request: ToolCallRequestInfo | ToolCallRequestInfo[];
    signal: AbortSignal;
    resolve: () => void;
    reject: (reason?: Error) => void;
  }> = [];
  private toolCallQueue: ToolCall[] = [];
  private completedToolCallsForBatch: CompletedToolCall[] = [];

  constructor(options: CoreToolSchedulerOptions) {
    this.config = options.config;
    this.outputUpdateHandler = options.outputUpdateHandler;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.getPreferredEditor = options.getPreferredEditor;

    // Subscribe to message bus for ASK_USER policy decisions
    // Use a static WeakMap to ensure we only subscribe ONCE per MessageBus instance
    // This prevents memory leaks when multiple CoreToolScheduler instances are created
    // (e.g., on every React render, or for each non-interactive tool call)
    if (this.config.getEnableMessageBusIntegration()) {
      const messageBus = this.config.getMessageBus();

      // Check if we've already subscribed a handler to this message bus
      if (!CoreToolScheduler.subscribedMessageBuses.has(messageBus)) {
        // Create a shared handler that will be used for this message bus
        const sharedHandler = (request: ToolConfirmationRequest) => {
          // When ASK_USER policy decision is made, respond with requiresUserConfirmation=true
          // to tell tools to use their legacy confirmation flow
          messageBus.publish({
            type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
            correlationId: request.correlationId,
            confirmed: false,
            requiresUserConfirmation: true,
          });
        };

        messageBus.subscribe(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          sharedHandler,
        );

        // Store the handler in the WeakMap so we don't subscribe again
        CoreToolScheduler.subscribedMessageBuses.set(messageBus, sharedHandler);
      }
    }
  }

  private setStatusInternal(
    targetCallId: string,
    status: 'success',
    signal: AbortSignal,
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'awaiting_approval',
    signal: AbortSignal,
    confirmationDetails: ToolCallConfirmationDetails,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'error',
    signal: AbortSignal,
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'cancelled',
    signal: AbortSignal,
    reason: string,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'executing' | 'scheduled' | 'validating',
    signal: AbortSignal,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    newStatus: Status,
    signal: AbortSignal,
    auxiliaryData?: unknown,
  ): void {
    this.toolCalls = this.toolCalls.map((currentCall) => {
      if (
        currentCall.request.callId !== targetCallId ||
        currentCall.status === 'success' ||
        currentCall.status === 'error' ||
        currentCall.status === 'cancelled'
      ) {
        return currentCall;
      }

      // currentCall is a non-terminal state here and should have startTime and tool.
      const existingStartTime = currentCall.startTime;
      const toolInstance = currentCall.tool;
      const invocation = currentCall.invocation;

      const outcome = currentCall.outcome;

      switch (newStatus) {
        case 'success': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;
          return {
            request: currentCall.request,
            tool: toolInstance,
            invocation,
            status: 'success',
            response: auxiliaryData as ToolCallResponseInfo,
            durationMs,
            outcome,
          } as SuccessfulToolCall;
        }
        case 'error': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;
          return {
            request: currentCall.request,
            status: 'error',
            tool: toolInstance,
            response: auxiliaryData as ToolCallResponseInfo,
            durationMs,
            outcome,
          } as ErroredToolCall;
        }
        case 'awaiting_approval':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'awaiting_approval',
            confirmationDetails: auxiliaryData as ToolCallConfirmationDetails,
            startTime: existingStartTime,
            outcome,
            invocation,
          } as WaitingToolCall;
        case 'scheduled':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'scheduled',
            startTime: existingStartTime,
            outcome,
            invocation,
          } as ScheduledToolCall;
        case 'cancelled': {
          const durationMs = existingStartTime
            ? Date.now() - existingStartTime
            : undefined;

          // Preserve diff for cancelled edit operations
          let resultDisplay: ToolResultDisplay | undefined = undefined;
          if (currentCall.status === 'awaiting_approval') {
            const waitingCall = currentCall as WaitingToolCall;
            if (waitingCall.confirmationDetails.type === 'edit') {
              resultDisplay = {
                fileDiff: waitingCall.confirmationDetails.fileDiff,
                fileName: waitingCall.confirmationDetails.fileName,
                originalContent:
                  waitingCall.confirmationDetails.originalContent,
                newContent: waitingCall.confirmationDetails.newContent,
              };
            }
          }

          const errorMessage = `[Operation Cancelled] Reason: ${auxiliaryData}`;
          return {
            request: currentCall.request,
            tool: toolInstance,
            invocation,
            status: 'cancelled',
            response: {
              callId: currentCall.request.callId,
              responseParts: [
                {
                  functionResponse: {
                    id: currentCall.request.callId,
                    name: currentCall.request.name,
                    response: {
                      error: errorMessage,
                    },
                  },
                },
              ],
              resultDisplay,
              error: undefined,
              errorType: undefined,
              contentLength: errorMessage.length,
            },
            durationMs,
            outcome,
          } as CancelledToolCall;
        }
        case 'validating':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'validating',
            startTime: existingStartTime,
            outcome,
            invocation,
          } as ValidatingToolCall;
        case 'executing':
          return {
            request: currentCall.request,
            tool: toolInstance,
            status: 'executing',
            startTime: existingStartTime,
            outcome,
            invocation,
          } as ExecutingToolCall;
        default: {
          const exhaustiveCheck: never = newStatus;
          return exhaustiveCheck;
        }
      }
    });
    this.notifyToolCallsUpdate();
  }

  private setArgsInternal(targetCallId: string, args: unknown): void {
    this.toolCalls = this.toolCalls.map((call) => {
      // We should never be asked to set args on an ErroredToolCall, but
      // we guard for the case anyways.
      if (call.request.callId !== targetCallId || call.status === 'error') {
        return call;
      }

      const invocationOrError = this.buildInvocation(
        call.tool,
        args as Record<string, unknown>,
      );
      if (invocationOrError instanceof Error) {
        const response = createErrorResponse(
          call.request,
          invocationOrError,
          ToolErrorType.INVALID_TOOL_PARAMS,
        );
        return {
          request: { ...call.request, args: args as Record<string, unknown> },
          status: 'error',
          tool: call.tool,
          response,
        } as ErroredToolCall;
      }

      return {
        ...call,
        request: { ...call.request, args: args as Record<string, unknown> },
        invocation: invocationOrError,
      };
    });
  }

  private isRunning(): boolean {
    return (
      this.isFinalizingToolCalls ||
      this.toolCalls.some(
        (call) =>
          call.status === 'executing' || call.status === 'awaiting_approval',
      )
    );
  }

  private buildInvocation(
    tool: AnyDeclarativeTool,
    args: object,
  ): AnyToolInvocation | Error {
    try {
      return tool.build(args);
    } catch (e) {
      if (e instanceof Error) {
        return e;
      }
      return new Error(String(e));
    }
  }

  /**
   * Generates a suggestion string for a tool name that was not found in the registry.
   * It finds the closest matches based on Levenshtein distance.
   * @param unknownToolName The tool name that was not found.
   * @param topN The number of suggestions to return. Defaults to 3.
   * @returns A suggestion string like " Did you mean 'tool'?" or " Did you mean one of: 'tool1', 'tool2'?", or an empty string if no suggestions are found.
   */
  private getToolSuggestion(unknownToolName: string, topN = 3): string {
    const allToolNames = this.config.getToolRegistry().getAllToolNames();

    const matches = allToolNames.map((toolName) => ({
      name: toolName,
      distance: levenshtein.get(unknownToolName, toolName),
    }));

    matches.sort((a, b) => a.distance - b.distance);

    const topNResults = matches.slice(0, topN);

    if (topNResults.length === 0) {
      return '';
    }

    const suggestedNames = topNResults
      .map((match) => `"${match.name}"`)
      .join(', ');

    if (topNResults.length > 1) {
      return ` Did you mean one of: ${suggestedNames}?`;
    } else {
      return ` Did you mean ${suggestedNames}?`;
    }
  }

  schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    return runInDevTraceSpan(
      { name: 'schedule' },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = request;
        if (this.isRunning() || this.isScheduling) {
          return new Promise((resolve, reject) => {
            const abortHandler = () => {
              // Find and remove the request from the queue
              const index = this.requestQueue.findIndex(
                (item) => item.request === request,
              );
              if (index > -1) {
                this.requestQueue.splice(index, 1);
                reject(new Error('Tool call cancelled while in queue.'));
              }
            };

            signal.addEventListener('abort', abortHandler, { once: true });

            this.requestQueue.push({
              request,
              signal,
              resolve: () => {
                signal.removeEventListener('abort', abortHandler);
                resolve();
              },
              reject: (reason?: Error) => {
                signal.removeEventListener('abort', abortHandler);
                reject(reason);
              },
            });
          });
        }
        return this._schedule(request, signal);
      },
    );
  }

  cancelAll(signal: AbortSignal): void {
    if (this.isCancelling) {
      return;
    }
    this.isCancelling = true;
    // Cancel the currently active tool call, if there is one.
    if (this.toolCalls.length > 0) {
      const activeCall = this.toolCalls[0];
      // Only cancel if it's in a cancellable state.
      if (
        activeCall.status === 'awaiting_approval' ||
        activeCall.status === 'executing' ||
        activeCall.status === 'scheduled' ||
        activeCall.status === 'validating'
      ) {
        this.setStatusInternal(
          activeCall.request.callId,
          'cancelled',
          signal,
          'User cancelled the operation.',
        );
      }
    }

    // Clear the queue and mark all queued items as cancelled for completion reporting.
    this._cancelAllQueuedCalls();

    // Finalize the batch immediately.
    void this.checkAndNotifyCompletion(signal);
  }

  private async _schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    this.isScheduling = true;
    this.isCancelling = false;
    try {
      if (this.isRunning()) {
        throw new Error(
          'Cannot schedule new tool calls while other tool calls are actively running (executing or awaiting approval).',
        );
      }
      const requestsToProcess = Array.isArray(request) ? request : [request];
      this.completedToolCallsForBatch = [];

      const newToolCalls: ToolCall[] = requestsToProcess.map(
        (reqInfo): ToolCall => {
          const toolInstance = this.config
            .getToolRegistry()
            .getTool(reqInfo.name);
          if (!toolInstance) {
            const suggestion = this.getToolSuggestion(reqInfo.name);
            const errorMessage = `Tool "${reqInfo.name}" not found in registry. Tools must use the exact names that are registered.${suggestion}`;
            return {
              status: 'error',
              request: reqInfo,
              response: createErrorResponse(
                reqInfo,
                new Error(errorMessage),
                ToolErrorType.TOOL_NOT_REGISTERED,
              ),
              durationMs: 0,
            };
          }

          const invocationOrError = this.buildInvocation(
            toolInstance,
            reqInfo.args,
          );
          if (invocationOrError instanceof Error) {
            return {
              status: 'error',
              request: reqInfo,
              tool: toolInstance,
              response: createErrorResponse(
                reqInfo,
                invocationOrError,
                ToolErrorType.INVALID_TOOL_PARAMS,
              ),
              durationMs: 0,
            };
          }

          return {
            status: 'validating',
            request: reqInfo,
            tool: toolInstance,
            invocation: invocationOrError,
            startTime: Date.now(),
          };
        },
      );

      this.toolCallQueue.push(...newToolCalls);
      await this._processNextInQueue(signal);
    } finally {
      this.isScheduling = false;
    }
  }

  private async _processNextInQueue(signal: AbortSignal): Promise<void> {
    // If there's already a tool being processed, or the queue is empty, stop.
    if (this.toolCalls.length > 0 || this.toolCallQueue.length === 0) {
      return;
    }

    // If cancellation happened between steps, handle it.
    if (signal.aborted) {
      this._cancelAllQueuedCalls();
      // Finalize the batch.
      await this.checkAndNotifyCompletion(signal);
      return;
    }

    const toolCall = this.toolCallQueue.shift()!;

    // This is now the single active tool call.
    this.toolCalls = [toolCall];
    this.notifyToolCallsUpdate();

    // Handle tools that were already errored during creation.
    if (toolCall.status === 'error') {
      // An error during validation means this "active" tool is already complete.
      // We need to check for batch completion to either finish or process the next in queue.
      await this.checkAndNotifyCompletion(signal);
      return;
    }

    // This logic is moved from the old `for` loop in `_schedule`.
    if (toolCall.status === 'validating') {
      const { request: reqInfo, invocation } = toolCall;

      try {
        if (signal.aborted) {
          this.setStatusInternal(
            reqInfo.callId,
            'cancelled',
            signal,
            'Tool call cancelled by user.',
          );
          // The completion check will handle the cascade.
          await this.checkAndNotifyCompletion(signal);
          return;
        }

        const confirmationDetails =
          await invocation.shouldConfirmExecute(signal);

        if (!confirmationDetails) {
          this.setToolCallOutcome(
            reqInfo.callId,
            ToolConfirmationOutcome.ProceedAlways,
          );
          this.setStatusInternal(reqInfo.callId, 'scheduled', signal);
        } else {
          if (this.isAutoApproved(toolCall)) {
            this.setToolCallOutcome(
              reqInfo.callId,
              ToolConfirmationOutcome.ProceedAlways,
            );
            this.setStatusInternal(reqInfo.callId, 'scheduled', signal);
          } else {
            // Fire Notification hook before showing confirmation to user
            const messageBus = this.config.getMessageBus();
            const hooksEnabled = this.config.getEnableHooks();
            if (hooksEnabled && messageBus) {
              await fireToolNotificationHook(messageBus, confirmationDetails);
            }

            // Allow IDE to resolve confirmation
            if (
              confirmationDetails.type === 'edit' &&
              confirmationDetails.ideConfirmation
            ) {
              confirmationDetails.ideConfirmation.then((resolution) => {
                if (resolution.status === 'accepted') {
                  this.handleConfirmationResponse(
                    reqInfo.callId,
                    confirmationDetails.onConfirm,
                    ToolConfirmationOutcome.ProceedOnce,
                    signal,
                  );
                } else {
                  this.handleConfirmationResponse(
                    reqInfo.callId,
                    confirmationDetails.onConfirm,
                    ToolConfirmationOutcome.Cancel,
                    signal,
                  );
                }
              });
            }

            const originalOnConfirm = confirmationDetails.onConfirm;
            const wrappedConfirmationDetails: ToolCallConfirmationDetails = {
              ...confirmationDetails,
              onConfirm: (
                outcome: ToolConfirmationOutcome,
                payload?: ToolConfirmationPayload,
              ) =>
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  originalOnConfirm,
                  outcome,
                  signal,
                  payload,
                ),
            };
            this.setStatusInternal(
              reqInfo.callId,
              'awaiting_approval',
              signal,
              wrappedConfirmationDetails,
            );
          }
        }
      } catch (error) {
        if (signal.aborted) {
          this.setStatusInternal(
            reqInfo.callId,
            'cancelled',
            signal,
            'Tool call cancelled by user.',
          );
          await this.checkAndNotifyCompletion(signal);
        } else {
          this.setStatusInternal(
            reqInfo.callId,
            'error',
            signal,
            createErrorResponse(
              reqInfo,
              error instanceof Error ? error : new Error(String(error)),
              ToolErrorType.UNHANDLED_EXCEPTION,
            ),
          );
          await this.checkAndNotifyCompletion(signal);
        }
      }
    }
    await this.attemptExecutionOfScheduledCalls(signal);
  }

  async handleConfirmationResponse(
    callId: string,
    originalOnConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>,
    outcome: ToolConfirmationOutcome,
    signal: AbortSignal,
    payload?: ToolConfirmationPayload,
  ): Promise<void> {
    const toolCall = this.toolCalls.find(
      (c) => c.request.callId === callId && c.status === 'awaiting_approval',
    );

    if (toolCall && toolCall.status === 'awaiting_approval') {
      await originalOnConfirm(outcome);
    }

    this.setToolCallOutcome(callId, outcome);

    if (outcome === ToolConfirmationOutcome.Cancel || signal.aborted) {
      // Instead of just cancelling one tool, trigger the full cancel cascade.
      this.cancelAll(signal);
      return; // `cancelAll` calls `checkAndNotifyCompletion`, so we can exit here.
    } else if (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
      const waitingToolCall = toolCall as WaitingToolCall;
      if (isModifiableDeclarativeTool(waitingToolCall.tool)) {
        const modifyContext = waitingToolCall.tool.getModifyContext(signal);
        const editorType = this.getPreferredEditor();
        if (!editorType) {
          return;
        }

        this.setStatusInternal(callId, 'awaiting_approval', signal, {
          ...waitingToolCall.confirmationDetails,
          isModifying: true,
        } as ToolCallConfirmationDetails);

        const contentOverrides =
          waitingToolCall.confirmationDetails.type === 'edit'
            ? {
                currentContent:
                  waitingToolCall.confirmationDetails.originalContent,
                proposedContent: waitingToolCall.confirmationDetails.newContent,
              }
            : undefined;

        const { updatedParams, updatedDiff } = await modifyWithEditor<
          typeof waitingToolCall.request.args
        >(
          waitingToolCall.request.args,
          modifyContext as ModifyContext<typeof waitingToolCall.request.args>,
          editorType,
          signal,
          contentOverrides,
        );
        this.setArgsInternal(callId, updatedParams);
        this.setStatusInternal(callId, 'awaiting_approval', signal, {
          ...waitingToolCall.confirmationDetails,
          fileDiff: updatedDiff,
          isModifying: false,
        } as ToolCallConfirmationDetails);
      }
    } else {
      // If the client provided new content, apply it before scheduling.
      if (payload?.newContent && toolCall) {
        await this._applyInlineModify(
          toolCall as WaitingToolCall,
          payload,
          signal,
        );
      }
      this.setStatusInternal(callId, 'scheduled', signal);
    }
    await this.attemptExecutionOfScheduledCalls(signal);
  }

  /**
   * Applies user-provided content changes to a tool call that is awaiting confirmation.
   * This method updates the tool's arguments and refreshes the confirmation prompt with a new diff
   * before the tool is scheduled for execution.
   * @private
   */
  private async _applyInlineModify(
    toolCall: WaitingToolCall,
    payload: ToolConfirmationPayload,
    signal: AbortSignal,
  ): Promise<void> {
    if (
      toolCall.confirmationDetails.type !== 'edit' ||
      !isModifiableDeclarativeTool(toolCall.tool)
    ) {
      return;
    }

    const modifyContext = toolCall.tool.getModifyContext(signal);
    const currentContent = await modifyContext.getCurrentContent(
      toolCall.request.args,
    );

    const updatedParams = modifyContext.createUpdatedParams(
      currentContent,
      payload.newContent,
      toolCall.request.args,
    );
    const updatedDiff = Diff.createPatch(
      modifyContext.getFilePath(toolCall.request.args),
      currentContent,
      payload.newContent,
      'Current',
      'Proposed',
    );

    this.setArgsInternal(toolCall.request.callId, updatedParams);
    this.setStatusInternal(
      toolCall.request.callId,
      'awaiting_approval',
      signal,
      {
        ...toolCall.confirmationDetails,
        fileDiff: updatedDiff,
      },
    );
  }

  private async attemptExecutionOfScheduledCalls(
    signal: AbortSignal,
  ): Promise<void> {
    const allCallsFinalOrScheduled = this.toolCalls.every(
      (call) =>
        call.status === 'scheduled' ||
        call.status === 'cancelled' ||
        call.status === 'success' ||
        call.status === 'error',
    );

    if (allCallsFinalOrScheduled) {
      const callsToExecute = this.toolCalls.filter(
        (call) => call.status === 'scheduled',
      );

      for (const toolCall of callsToExecute) {
        if (toolCall.status !== 'scheduled') continue;

        const scheduledCall = toolCall;
        const { callId, name: toolName } = scheduledCall.request;
        const invocation = scheduledCall.invocation;
        this.setStatusInternal(callId, 'executing', signal);

        const liveOutputCallback =
          scheduledCall.tool.canUpdateOutput && this.outputUpdateHandler
            ? (outputChunk: string | AnsiOutput) => {
                if (this.outputUpdateHandler) {
                  this.outputUpdateHandler(callId, outputChunk);
                }
                this.toolCalls = this.toolCalls.map((tc) =>
                  tc.request.callId === callId && tc.status === 'executing'
                    ? { ...tc, liveOutput: outputChunk }
                    : tc,
                );
                this.notifyToolCallsUpdate();
              }
            : undefined;

        const shellExecutionConfig = this.config.getShellExecutionConfig();
        const hooksEnabled = this.config.getEnableHooks();
        const messageBus = this.config.getMessageBus();

        await runInDevTraceSpan(
          {
            name: toolCall.tool.name,
            attributes: { type: 'tool-call' },
          },
          async ({ metadata: spanMetadata }) => {
            spanMetadata.input = {
              request: toolCall.request,
            };
            // TODO: Refactor to remove special casing for ShellToolInvocation.
            // Introduce a generic callbacks object for the execute method to handle
            // things like `onPid` and `onLiveOutput`. This will make the scheduler
            // agnostic to the invocation type.
            let promise: Promise<ToolResult>;
            if (invocation instanceof ShellToolInvocation) {
              const setPidCallback = (pid: number) => {
                this.toolCalls = this.toolCalls.map((tc) =>
                  tc.request.callId === callId && tc.status === 'executing'
                    ? { ...tc, pid }
                    : tc,
                );
                this.notifyToolCallsUpdate();
              };
              promise = executeToolWithHooks(
                invocation,
                toolName,
                signal,
                messageBus,
                hooksEnabled,
                liveOutputCallback,
                shellExecutionConfig,
                setPidCallback,
              );
            } else {
              promise = executeToolWithHooks(
                invocation,
                toolName,
                signal,
                messageBus,
                hooksEnabled,
                liveOutputCallback,
                shellExecutionConfig,
              );
            }

            try {
              const toolResult: ToolResult = await promise;
              spanMetadata.output = toolResult;
              if (signal.aborted) {
                this.setStatusInternal(
                  callId,
                  'cancelled',
                  signal,
                  'User cancelled tool execution.',
                );
              } else if (toolResult.error === undefined) {
                let content = toolResult.llmContent;
                let outputFile: string | undefined = undefined;
                const contentLength =
                  typeof content === 'string' ? content.length : undefined;
                if (
                  typeof content === 'string' &&
                  toolName === SHELL_TOOL_NAME &&
                  this.config.getEnableToolOutputTruncation() &&
                  this.config.getTruncateToolOutputThreshold() > 0 &&
                  this.config.getTruncateToolOutputLines() > 0
                ) {
                  const originalContentLength = content.length;
                  const threshold =
                    this.config.getTruncateToolOutputThreshold();
                  const lines = this.config.getTruncateToolOutputLines();
                  const truncatedResult = await truncateAndSaveToFile(
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
                      new ToolOutputTruncatedEvent(
                        scheduledCall.request.prompt_id,
                        {
                          toolName,
                          originalContentLength,
                          truncatedContentLength: content.length,
                          threshold,
                          lines,
                        },
                      ),
                    );
                  }
                }

                const response = convertToFunctionResponse(
                  toolName,
                  callId,
                  content,
                );
                const successResponse: ToolCallResponseInfo = {
                  callId,
                  responseParts: response,
                  resultDisplay: toolResult.returnDisplay,
                  error: undefined,
                  errorType: undefined,
                  outputFile,
                  contentLength,
                };
                this.setStatusInternal(
                  callId,
                  'success',
                  signal,
                  successResponse,
                );
              } else {
                // It is a failure
                const error = new Error(toolResult.error.message);
                const errorResponse = createErrorResponse(
                  scheduledCall.request,
                  error,
                  toolResult.error.type,
                );
                this.setStatusInternal(callId, 'error', signal, errorResponse);
              }
            } catch (executionError: unknown) {
              spanMetadata.error = executionError;
              if (signal.aborted) {
                this.setStatusInternal(
                  callId,
                  'cancelled',
                  signal,
                  'User cancelled tool execution.',
                );
              } else {
                this.setStatusInternal(
                  callId,
                  'error',
                  signal,
                  createErrorResponse(
                    scheduledCall.request,
                    executionError instanceof Error
                      ? executionError
                      : new Error(String(executionError)),
                    ToolErrorType.UNHANDLED_EXCEPTION,
                  ),
                );
              }
            }
            await this.checkAndNotifyCompletion(signal);
          },
        );
      }
    }
  }

  private async checkAndNotifyCompletion(signal: AbortSignal): Promise<void> {
    // This method is now only concerned with the single active tool call.
    if (this.toolCalls.length === 0) {
      // It's possible to be called when a batch is cancelled before any tool has started.
      if (signal.aborted && this.toolCallQueue.length > 0) {
        this._cancelAllQueuedCalls();
      }
    } else {
      const activeCall = this.toolCalls[0];
      const isTerminal =
        activeCall.status === 'success' ||
        activeCall.status === 'error' ||
        activeCall.status === 'cancelled';

      // If the active tool is not in a terminal state (e.g., it's 'executing' or 'awaiting_approval'),
      // then the scheduler is still busy or paused. We should not proceed.
      if (!isTerminal) {
        return;
      }

      // The active tool is finished. Move it to the completed batch.
      const completedCall = activeCall as CompletedToolCall;
      this.completedToolCallsForBatch.push(completedCall);
      logToolCall(this.config, new ToolCallEvent(completedCall));

      // Clear the active tool slot. This is crucial for the sequential processing.
      this.toolCalls = [];
    }

    // Now, check if the entire batch is complete.
    // The batch is complete if the queue is empty or the operation was cancelled.
    if (this.toolCallQueue.length === 0 || signal.aborted) {
      if (signal.aborted) {
        this._cancelAllQueuedCalls();
      }

      // If there's nothing to report and we weren't cancelled, we can stop.
      // But if we were cancelled, we must proceed to potentially start the next queued request.
      if (this.completedToolCallsForBatch.length === 0 && !signal.aborted) {
        return;
      }

      if (this.onAllToolCallsComplete) {
        this.isFinalizingToolCalls = true;
        // Use the batch array, not the (now empty) active array.
        await this.onAllToolCallsComplete(this.completedToolCallsForBatch);
        this.completedToolCallsForBatch = []; // Clear after reporting.
        this.isFinalizingToolCalls = false;
      }
      this.isCancelling = false;
      this.notifyToolCallsUpdate();

      // After completion of the entire batch, process the next item in the main request queue.
      if (this.requestQueue.length > 0) {
        const next = this.requestQueue.shift()!;
        this._schedule(next.request, next.signal)
          .then(next.resolve)
          .catch(next.reject);
      }
    } else {
      // The batch is not yet complete, so continue processing the current batch sequence.
      await this._processNextInQueue(signal);
    }
  }

  private _cancelAllQueuedCalls(): void {
    while (this.toolCallQueue.length > 0) {
      const queuedCall = this.toolCallQueue.shift()!;
      // Don't cancel tools that already errored during validation.
      if (queuedCall.status === 'error') {
        this.completedToolCallsForBatch.push(queuedCall);
        continue;
      }
      const durationMs =
        'startTime' in queuedCall && queuedCall.startTime
          ? Date.now() - queuedCall.startTime
          : undefined;
      const errorMessage =
        '[Operation Cancelled] User cancelled the operation.';
      this.completedToolCallsForBatch.push({
        request: queuedCall.request,
        tool: queuedCall.tool,
        invocation: queuedCall.invocation,
        status: 'cancelled',
        response: {
          callId: queuedCall.request.callId,
          responseParts: [
            {
              functionResponse: {
                id: queuedCall.request.callId,
                name: queuedCall.request.name,
                response: {
                  error: errorMessage,
                },
              },
            },
          ],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
          contentLength: errorMessage.length,
        },
        durationMs,
        outcome: ToolConfirmationOutcome.Cancel,
      });
    }
  }

  private notifyToolCallsUpdate(): void {
    if (this.onToolCallsUpdate) {
      this.onToolCallsUpdate([
        ...this.completedToolCallsForBatch,
        ...this.toolCalls,
        ...this.toolCallQueue,
      ]);
    }
  }

  private setToolCallOutcome(callId: string, outcome: ToolConfirmationOutcome) {
    this.toolCalls = this.toolCalls.map((call) => {
      if (call.request.callId !== callId) return call;
      return {
        ...call,
        outcome,
      };
    });
  }

  private isAutoApproved(toolCall: ValidatingToolCall): boolean {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return true;
    }

    const allowedTools = this.config.getAllowedTools() || [];
    const { tool, invocation } = toolCall;
    const toolName = typeof tool === 'string' ? tool : tool.name;

    if (SHELL_TOOL_NAMES.includes(toolName)) {
      return isShellInvocationAllowlisted(invocation, allowedTools);
    }

    return doesToolInvocationMatch(tool, invocation, allowedTools);
  }
}
