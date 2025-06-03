/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolConfirmationOutcome,
  Tool,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolRegistry,
  ApprovalMode,
} from '../index.js';
import { Part, PartUnion, PartListUnion } from '@google/genai';

export type ValidatingToolCall = {
  status: 'validating';
  request: ToolCallRequestInfo;
  tool: Tool;
};

export type ScheduledToolCall = {
  status: 'scheduled';
  request: ToolCallRequestInfo;
  tool: Tool;
};

export type ErroredToolCall = {
  status: 'error';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
};

export type SuccessfulToolCall = {
  status: 'success';
  request: ToolCallRequestInfo;
  tool: Tool;
  response: ToolCallResponseInfo;
};

export type ExecutingToolCall = {
  status: 'executing';
  request: ToolCallRequestInfo;
  tool: Tool;
  liveOutput?: string;
};

export type CancelledToolCall = {
  status: 'cancelled';
  request: ToolCallRequestInfo;
  response: ToolCallResponseInfo;
  tool: Tool;
};

export type WaitingToolCall = {
  status: 'awaiting_approval';
  request: ToolCallRequestInfo;
  tool: Tool;
  confirmationDetails: ToolCallConfirmationDetails;
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
  outputChunk: string,
) => void;

export type AllToolCallsCompleteHandler = (
  completedToolCalls: CompletedToolCall[],
) => void;

export type ToolCallsUpdateHandler = (toolCalls: ToolCall[]) => void;

/**
 * Formats tool output for a Gemini FunctionResponse.
 */
export function formatLlmContentForFunctionResponse(
  llmContent: PartListUnion,
): {
  functionResponseJson: Record<string, string>;
  additionalParts: PartUnion[];
} {
  const additionalParts: PartUnion[] = [];
  let functionResponseJson: Record<string, string>;

  const contentToProcess =
    Array.isArray(llmContent) && llmContent.length === 1
      ? llmContent[0]
      : llmContent;

  if (typeof contentToProcess === 'string') {
    functionResponseJson = { output: contentToProcess };
  } else if (Array.isArray(contentToProcess)) {
    functionResponseJson = {
      status: 'Tool execution succeeded.',
    };
    additionalParts.push(...contentToProcess);
  } else if (contentToProcess.inlineData || contentToProcess.fileData) {
    const mimeType =
      contentToProcess.inlineData?.mimeType ||
      contentToProcess.fileData?.mimeType ||
      'unknown';
    functionResponseJson = {
      status: `Binary content of type ${mimeType} was processed.`,
    };
    additionalParts.push(contentToProcess);
  } else if (contentToProcess.text !== undefined) {
    functionResponseJson = { output: contentToProcess.text };
  } else if (contentToProcess.functionResponse) {
    functionResponseJson = JSON.parse(
      JSON.stringify(contentToProcess.functionResponse),
    );
  } else {
    functionResponseJson = { status: 'Tool execution succeeded.' };
    additionalParts.push(contentToProcess);
  }

  return {
    functionResponseJson,
    additionalParts,
  };
}

const createErrorResponse = (
  request: ToolCallRequestInfo,
  error: Error,
): ToolCallResponseInfo => ({
  callId: request.callId,
  error,
  responseParts: {
    functionResponse: {
      id: request.callId,
      name: request.name,
      response: { error: error.message },
    },
  },
  resultDisplay: error.message,
});

interface CoreToolSchedulerOptions {
  toolRegistry: Promise<ToolRegistry>;
  outputUpdateHandler?: OutputUpdateHandler;
  onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  onToolCallsUpdate?: ToolCallsUpdateHandler;
  approvalMode?: ApprovalMode;
}

export class CoreToolScheduler {
  private toolRegistry: Promise<ToolRegistry>;
  private toolCalls: ToolCall[] = [];
  private abortController: AbortController;
  private outputUpdateHandler?: OutputUpdateHandler;
  private onAllToolCallsComplete?: AllToolCallsCompleteHandler;
  private onToolCallsUpdate?: ToolCallsUpdateHandler;
  private approvalMode: ApprovalMode;

  constructor(options: CoreToolSchedulerOptions) {
    this.toolRegistry = options.toolRegistry;
    this.outputUpdateHandler = options.outputUpdateHandler;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.approvalMode = options.approvalMode ?? ApprovalMode.DEFAULT;
    this.abortController = new AbortController();
  }

  private setStatusInternal(
    targetCallId: string,
    status: 'success',
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'awaiting_approval',
    confirmationDetails: ToolCallConfirmationDetails,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'error',
    response: ToolCallResponseInfo,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'cancelled',
    reason: string,
  ): void;
  private setStatusInternal(
    targetCallId: string,
    status: 'executing' | 'scheduled' | 'validating',
  ): void;
  private setStatusInternal(
    targetCallId: string,
    newStatus: Status,
    auxiliaryData?: unknown,
  ): void {
    this.toolCalls = this.toolCalls.map((currentCall) => {
      if (
        currentCall.request.callId !== targetCallId ||
        currentCall.status === 'error'
      ) {
        return currentCall;
      }

      const callWithToolContext = currentCall as ToolCall & { tool: Tool };

      switch (newStatus) {
        case 'success':
          return {
            ...callWithToolContext,
            status: 'success',
            response: auxiliaryData as ToolCallResponseInfo,
          } as SuccessfulToolCall;
        case 'error':
          return {
            request: currentCall.request,
            status: 'error',
            response: auxiliaryData as ToolCallResponseInfo,
          } as ErroredToolCall;
        case 'awaiting_approval':
          return {
            ...callWithToolContext,
            status: 'awaiting_approval',
            confirmationDetails: auxiliaryData as ToolCallConfirmationDetails,
          } as WaitingToolCall;
        case 'scheduled':
          return {
            ...callWithToolContext,
            status: 'scheduled',
          } as ScheduledToolCall;
        case 'cancelled':
          return {
            ...callWithToolContext,
            status: 'cancelled',
            response: {
              callId: currentCall.request.callId,
              responseParts: {
                functionResponse: {
                  id: currentCall.request.callId,
                  name: currentCall.request.name,
                  response: {
                    error: `[Operation Cancelled] Reason: ${auxiliaryData}`,
                  },
                },
              },
              resultDisplay: undefined,
              error: undefined,
            },
          } as CancelledToolCall;
        case 'validating':
          return {
            ...(currentCall as ValidatingToolCall),
            status: 'validating',
          } as ValidatingToolCall;
        case 'executing':
          return {
            ...callWithToolContext,
            status: 'executing',
          } as ExecutingToolCall;
        default: {
          const exhaustiveCheck: never = newStatus;
          return exhaustiveCheck;
        }
      }
    });
    this.notifyToolCallsUpdate();
    this.checkAndNotifyCompletion();
  }

  private isRunning(): boolean {
    return this.toolCalls.some(
      (call) =>
        call.status === 'executing' || call.status === 'awaiting_approval',
    );
  }

  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
  ): Promise<void> {
    if (this.isRunning()) {
      throw new Error(
        'Cannot schedule new tool calls while other tool calls are actively running (executing or awaiting approval).',
      );
    }
    const requestsToProcess = Array.isArray(request) ? request : [request];
    const toolRegistry = await this.toolRegistry;

    const newToolCalls: ToolCall[] = requestsToProcess.map(
      (reqInfo): ToolCall => {
        const toolInstance = toolRegistry.getTool(reqInfo.name);
        if (!toolInstance) {
          return {
            status: 'error',
            request: reqInfo,
            response: createErrorResponse(
              reqInfo,
              new Error(`Tool "${reqInfo.name}" not found in registry.`),
            ),
          };
        }
        return { status: 'validating', request: reqInfo, tool: toolInstance };
      },
    );

    this.toolCalls = this.toolCalls.concat(newToolCalls);
    this.notifyToolCallsUpdate();

    for (const toolCall of newToolCalls) {
      if (toolCall.status !== 'validating') {
        continue;
      }

      const { request: reqInfo, tool: toolInstance } = toolCall;
      try {
        if (this.approvalMode === ApprovalMode.YOLO) {
          this.setStatusInternal(reqInfo.callId, 'scheduled');
        } else {
          const confirmationDetails = await toolInstance.shouldConfirmExecute(
            reqInfo.args,
            this.abortController.signal,
          );

          if (confirmationDetails) {
            const originalOnConfirm = confirmationDetails.onConfirm;
            const wrappedConfirmationDetails: ToolCallConfirmationDetails = {
              ...confirmationDetails,
              onConfirm: (outcome: ToolConfirmationOutcome) =>
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  originalOnConfirm,
                  outcome,
                ),
            };
            this.setStatusInternal(
              reqInfo.callId,
              'awaiting_approval',
              wrappedConfirmationDetails,
            );
          } else {
            this.setStatusInternal(reqInfo.callId, 'scheduled');
          }
        }
      } catch (error) {
        this.setStatusInternal(
          reqInfo.callId,
          'error',
          createErrorResponse(
            reqInfo,
            error instanceof Error ? error : new Error(String(error)),
          ),
        );
      }
    }
    this.attemptExecutionOfScheduledCalls();
    this.checkAndNotifyCompletion();
  }

  async handleConfirmationResponse(
    callId: string,
    originalOnConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>,
    outcome: ToolConfirmationOutcome,
  ): Promise<void> {
    const toolCall = this.toolCalls.find(
      (c) => c.request.callId === callId && c.status === 'awaiting_approval',
    );

    if (toolCall && toolCall.status === 'awaiting_approval') {
      await originalOnConfirm(outcome);
    }

    if (outcome === ToolConfirmationOutcome.Cancel) {
      this.setStatusInternal(
        callId,
        'cancelled',
        'User did not allow tool call',
      );
    } else {
      this.setStatusInternal(callId, 'scheduled');
    }
    this.attemptExecutionOfScheduledCalls();
  }

  private attemptExecutionOfScheduledCalls(): void {
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

      callsToExecute.forEach((toolCall) => {
        if (toolCall.status !== 'scheduled') return;

        const scheduledCall = toolCall as ScheduledToolCall;
        const { callId, name: toolName } = scheduledCall.request;
        this.setStatusInternal(callId, 'executing');

        const liveOutputCallback =
          scheduledCall.tool.canUpdateOutput && this.outputUpdateHandler
            ? (outputChunk: string) => {
                if (this.outputUpdateHandler) {
                  this.outputUpdateHandler(callId, outputChunk);
                }
                this.toolCalls = this.toolCalls.map((tc) =>
                  tc.request.callId === callId && tc.status === 'executing'
                    ? { ...(tc as ExecutingToolCall), liveOutput: outputChunk }
                    : tc,
                );
                this.notifyToolCallsUpdate();
              }
            : undefined;

        scheduledCall.tool
          .execute(
            scheduledCall.request.args,
            this.abortController.signal,
            liveOutputCallback,
          )
          .then((toolResult: ToolResult) => {
            if (this.abortController.signal.aborted) {
              this.setStatusInternal(
                callId,
                'cancelled',
                this.abortController.signal.reason || 'Execution aborted.',
              );
              return;
            }

            const { functionResponseJson, additionalParts } =
              formatLlmContentForFunctionResponse(toolResult.llmContent);

            const functionResponsePart: Part = {
              functionResponse: {
                name: toolName,
                id: callId,
                response: functionResponseJson,
              },
            };

            const successResponse: ToolCallResponseInfo = {
              callId,
              responseParts: [functionResponsePart, ...additionalParts],
              resultDisplay: toolResult.returnDisplay,
              error: undefined,
            };
            this.setStatusInternal(callId, 'success', successResponse);
          })
          .catch((executionError: Error) => {
            this.setStatusInternal(
              callId,
              'error',
              createErrorResponse(
                scheduledCall.request,
                executionError instanceof Error
                  ? executionError
                  : new Error(String(executionError)),
              ),
            );
          });
      });
    }
  }

  private checkAndNotifyCompletion(): void {
    const allCallsAreTerminal = this.toolCalls.every(
      (call) =>
        call.status === 'success' ||
        call.status === 'error' ||
        call.status === 'cancelled',
    );

    if (this.toolCalls.length > 0 && allCallsAreTerminal) {
      const completedCalls = [...this.toolCalls] as CompletedToolCall[];
      this.toolCalls = [];

      if (this.onAllToolCallsComplete) {
        this.onAllToolCallsComplete(completedCalls);
      }
      this.abortController = new AbortController();
      this.notifyToolCallsUpdate();
    }
  }

  cancelAll(reason: string = 'User initiated cancellation.'): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason);
    }
    this.abortController = new AbortController();

    const callsToCancel = [...this.toolCalls];
    callsToCancel.forEach((call) => {
      if (
        call.status !== 'error' &&
        call.status !== 'success' &&
        call.status !== 'cancelled'
      ) {
        this.setStatusInternal(call.request.callId, 'cancelled', reason);
      }
    });
  }

  private notifyToolCallsUpdate(): void {
    if (this.onToolCallsUpdate) {
      this.onToolCallsUpdate([...this.toolCalls]);
    }
  }
}
