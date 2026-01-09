/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ToolResultDisplay,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  type ToolCallConfirmationDetails,
  type ToolConfirmationPayload,
  ToolConfirmationOutcome,
} from '../tools/tools.js';
import type { EditorType } from '../utils/editor.js';
import type { Config } from '../config/config.js';
import { PolicyDecision } from '../policy/types.js';
import { BeforeToolHookOutput } from '../hooks/types.js';
import { logToolCall } from '../telemetry/loggers.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ToolCallEvent } from '../telemetry/types.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import { ToolModificationHandler } from '../scheduler/tool-modifier.js';
import { getToolSuggestion } from '../utils/tool-utils.js';
import type { ToolConfirmationRequest } from '../confirmation-bus/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  fireToolNotificationHook,
  fireBeforeToolHook,
} from './coreToolHookTriggers.js';
import {
  type ToolCall,
  type ValidatingToolCall,
  type ScheduledToolCall,
  type ErroredToolCall,
  type SuccessfulToolCall,
  type ExecutingToolCall,
  type CancelledToolCall,
  type WaitingToolCall,
  type Status,
  type CompletedToolCall,
  type ConfirmHandler,
  type OutputUpdateHandler,
  type AllToolCallsCompleteHandler,
  type ToolCallsUpdateHandler,
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
} from '../scheduler/types.js';
import { ToolExecutor } from '../scheduler/tool-executor.js';

export type {
  ToolCall,
  ValidatingToolCall,
  ScheduledToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
  ExecutingToolCall,
  CancelledToolCall,
  WaitingToolCall,
  Status,
  CompletedToolCall,
  ConfirmHandler,
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
};

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
  private toolExecutor: ToolExecutor;
  private toolModifier: ToolModificationHandler;

  constructor(options: CoreToolSchedulerOptions) {
    this.config = options.config;
    this.outputUpdateHandler = options.outputUpdateHandler;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.getPreferredEditor = options.getPreferredEditor;
    this.toolExecutor = new ToolExecutor(this.config);
    this.toolModifier = new ToolModificationHandler();

    // Subscribe to message bus for ASK_USER policy decisions
    // Use a static WeakMap to ensure we only subscribe ONCE per MessageBus instance
    // This prevents memory leaks when multiple CoreToolScheduler instances are created
    // (e.g., on every React render, or for each non-interactive tool call)
    const messageBus = this.config.getMessageBus();

    // Check if we've already subscribed a handler to this message bus
    if (!CoreToolScheduler.subscribedMessageBuses.has(messageBus)) {
      // Create a shared handler that will be used for this message bus
      const sharedHandler = (request: ToolConfirmationRequest) => {
        // When ASK_USER policy decision is made, respond with requiresUserConfirmation=true
        // to tell tools to use their legacy confirmation flow
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
            const waitingCall = currentCall;
            if (waitingCall.confirmationDetails.type === 'edit') {
              resultDisplay = {
                fileDiff: waitingCall.confirmationDetails.fileDiff,
                fileName: waitingCall.confirmationDetails.fileName,
                originalContent:
                  waitingCall.confirmationDetails.originalContent,
                newContent: waitingCall.confirmationDetails.newContent,
                filePath: waitingCall.confirmationDetails.filePath,
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
            const suggestion = getToolSuggestion(
              reqInfo.name,
              this.config.getToolRegistry().getAllToolNames(),
            );
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
      const { request: reqInfo } = toolCall;
      let { invocation } = toolCall;

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

        const messageBus = this.config.getMessageBus();
        const hooksEnabled = this.config.getEnableHooks();
        let hookDecision: string | undefined = undefined;
        let hookSystemMessage: string | undefined = undefined;

        // Fire BeforeTool hook
        if (hooksEnabled && messageBus) {
          const beforeOutput = await fireBeforeToolHook(
            messageBus,
            reqInfo.name,
            invocation.params as Record<string, unknown>,
          );

          if (beforeOutput?.shouldStopExecution()) {
            const reason = beforeOutput.getEffectiveReason();
            this.setStatusInternal(
              reqInfo.callId,
              'error',
              signal,
              createErrorResponse(
                reqInfo,
                new Error(`Agent execution stopped by hook: ${reason}`),
                ToolErrorType.STOP_EXECUTION,
              ),
            );
            await this.checkAndNotifyCompletion(signal);
            return;
          }

          const blockingError = beforeOutput?.getBlockingError();
          if (blockingError?.blocked) {
            this.setStatusInternal(
              reqInfo.callId,
              'error',
              signal,
              createErrorResponse(
                reqInfo,
                new Error(`Tool execution blocked: ${blockingError.reason}`),
                ToolErrorType.EXECUTION_FAILED,
              ),
            );
            await this.checkAndNotifyCompletion(signal);
            return;
          }

          hookDecision = beforeOutput?.decision;
          hookSystemMessage = beforeOutput?.systemMessage;

          if (beforeOutput instanceof BeforeToolHookOutput) {
            const modifiedInput = beforeOutput.getModifiedToolInput();
            if (modifiedInput) {
              Object.assign(invocation.params, modifiedInput);
              // Recreate invocation to validate and update derived state
              const invocationOrError = this.buildInvocation(
                toolCall.tool,
                invocation.params,
              );
              if (invocationOrError instanceof Error) {
                this.setStatusInternal(
                  reqInfo.callId,
                  'error',
                  signal,
                  createErrorResponse(
                    reqInfo,
                    invocationOrError,
                    ToolErrorType.INVALID_TOOL_PARAMS,
                  ),
                );
                await this.checkAndNotifyCompletion(signal);
                return;
              }
              invocation = invocationOrError;
              toolCall.invocation = invocation;
              toolCall.inputModification = {
                wasModified: true,
                modifiedKeys: Object.keys(modifiedInput),
              };
            }
          }
        }

        // Policy Check using PolicyEngine
        // We must reconstruct the FunctionCall format expected by PolicyEngine
        const toolCallForPolicy = {
          name: toolCall.request.name,
          args: toolCall.request.args,
        };
        const { decision } = await this.config
          .getPolicyEngine()
          .check(toolCallForPolicy, undefined); // Server name undefined for local tools

        if (decision === PolicyDecision.DENY) {
          const errorMessage = `Tool execution denied by policy.`;
          this.setStatusInternal(
            reqInfo.callId,
            'error',
            signal,
            createErrorResponse(
              reqInfo,
              new Error(errorMessage),
              ToolErrorType.POLICY_VIOLATION,
            ),
          );
          await this.checkAndNotifyCompletion(signal);
          return;
        }

        const confirmationDetails =
          await invocation.shouldConfirmExecute(signal);

        const requiresConfirmation =
          !!confirmationDetails ||
          hookDecision === 'ask' ||
          decision === PolicyDecision.ASK_USER;

        if (!requiresConfirmation) {
          this.setToolCallOutcome(
            reqInfo.callId,
            ToolConfirmationOutcome.ProceedAlways,
          );
          this.setStatusInternal(reqInfo.callId, 'scheduled', signal);
        } else {
          // PolicyDecision.ASK_USER or Hook 'ask'

          if (!this.config.isInteractive()) {
            throw new Error(
              `Tool execution for "${
                toolCall.tool.displayName || toolCall.tool.name
              }" requires user confirmation, which is not supported in non-interactive mode.`,
            );
          }

          // Construct valid confirmation details if they don't exist (e.g. forced by 'ask')
          const finalConfirmationDetails: ToolCallConfirmationDetails =
            confirmationDetails || {
              type: 'info',
              title: `Confirm: ${
                toolCall.tool.displayName || toolCall.tool.name
              }`,
              prompt: `Tool execution was flagged for confirmation.`,
              onConfirm: async () => {},
              systemMessage: hookSystemMessage,
            };

          // Ensure system message is attached if provided by hook
          if (hookSystemMessage && !finalConfirmationDetails.systemMessage) {
            finalConfirmationDetails.systemMessage = hookSystemMessage;
          }

          // Fire Notification hook before showing confirmation to user
          if (hooksEnabled && messageBus) {
            await fireToolNotificationHook(
              messageBus,
              finalConfirmationDetails,
            );
          }

          // Allow IDE to resolve confirmation
          if (
            finalConfirmationDetails.type === 'edit' &&
            finalConfirmationDetails.ideConfirmation
          ) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            finalConfirmationDetails.ideConfirmation.then((resolution) => {
              if (resolution.status === 'accepted') {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  finalConfirmationDetails.onConfirm,
                  ToolConfirmationOutcome.ProceedOnce,
                  signal,
                );
              } else {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.handleConfirmationResponse(
                  reqInfo.callId,
                  finalConfirmationDetails.onConfirm,
                  ToolConfirmationOutcome.Cancel,
                  signal,
                );
              }
            });
          }

          const originalOnConfirm = finalConfirmationDetails.onConfirm;
          const wrappedConfirmationDetails: ToolCallConfirmationDetails = {
            ...finalConfirmationDetails,
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

      const editorType = this.getPreferredEditor();
      if (!editorType) {
        return;
      }

      this.setStatusInternal(callId, 'awaiting_approval', signal, {
        ...waitingToolCall.confirmationDetails,
        isModifying: true,
      } as ToolCallConfirmationDetails);

      const result = await this.toolModifier.handleModifyWithEditor(
        waitingToolCall,
        editorType,
        signal,
      );

      // Restore status (isModifying: false) and update diff if result exists
      if (result) {
        this.setArgsInternal(callId, result.updatedParams);
        this.setStatusInternal(callId, 'awaiting_approval', signal, {
          ...waitingToolCall.confirmationDetails,
          fileDiff: result.updatedDiff,
          isModifying: false,
        } as ToolCallConfirmationDetails);
      } else {
        this.setStatusInternal(callId, 'awaiting_approval', signal, {
          ...waitingToolCall.confirmationDetails,
          isModifying: false,
        } as ToolCallConfirmationDetails);
      }
    } else {
      // If the client provided new content, apply it and wait for
      // re-confirmation.
      if (payload?.newContent && toolCall) {
        const result = await this.toolModifier.applyInlineModify(
          toolCall as WaitingToolCall,
          payload,
          signal,
        );
        if (result) {
          this.setArgsInternal(callId, result.updatedParams);
          this.setStatusInternal(callId, 'awaiting_approval', signal, {
            ...(toolCall as WaitingToolCall).confirmationDetails,
            fileDiff: result.updatedDiff,
          } as ToolCallConfirmationDetails);
          // After an inline modification, wait for another user confirmation.
          return;
        }
      }
      this.setStatusInternal(callId, 'scheduled', signal);
    }
    await this.attemptExecutionOfScheduledCalls(signal);
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

        this.setStatusInternal(toolCall.request.callId, 'executing', signal);
        const executingCall = this.toolCalls.find(
          (c) => c.request.callId === toolCall.request.callId,
        );

        if (!executingCall) {
          // Should not happen, but safe guard
          continue;
        }

        const completedCall = await this.toolExecutor.execute({
          call: executingCall,
          signal,
          outputUpdateHandler: (callId, output) => {
            if (this.outputUpdateHandler) {
              this.outputUpdateHandler(callId, output);
            }
            this.toolCalls = this.toolCalls.map((tc) =>
              tc.request.callId === callId && tc.status === 'executing'
                ? { ...tc, liveOutput: output }
                : tc,
            );
            this.notifyToolCallsUpdate();
          },
          onUpdateToolCall: (updatedCall) => {
            this.toolCalls = this.toolCalls.map((tc) =>
              tc.request.callId === updatedCall.request.callId
                ? updatedCall
                : tc,
            );
            this.notifyToolCallsUpdate();
          },
        });

        this.toolCalls = this.toolCalls.map((tc) =>
          tc.request.callId === completedCall.request.callId
            ? completedCall
            : tc,
        );
        this.notifyToolCallsUpdate();

        await this.checkAndNotifyCompletion(signal);
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
}
