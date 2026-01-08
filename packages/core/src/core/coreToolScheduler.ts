/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  type ToolCallConfirmationDetails,
  type ToolConfirmationPayload,
  ToolConfirmationOutcome,
} from '../tools/tools.js';
import type { EditorType } from '../utils/editor.js';
import type { Config } from '../config/config.js';
import { PolicyDecision } from '../policy/types.js';
import { logToolCall } from '../telemetry/loggers.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ToolCallEvent } from '../telemetry/types.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import { ToolModificationHandler } from '../scheduler/tool-modifier.js';
import { getToolSuggestion } from '../utils/tool-utils.js';
import type { ToolConfirmationRequest } from '../confirmation-bus/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { fireToolNotificationHook } from './coreToolHookTriggers.js';
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
import { SchedulerStateManager } from '../scheduler/state-manager.js';

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
  private toolExecutor: ToolExecutor;
  private toolModifier: ToolModificationHandler;
  private state: SchedulerStateManager;

  constructor(options: CoreToolSchedulerOptions) {
    this.config = options.config;
    this.outputUpdateHandler = options.outputUpdateHandler;
    this.onAllToolCallsComplete = options.onAllToolCallsComplete;
    this.onToolCallsUpdate = options.onToolCallsUpdate;
    this.getPreferredEditor = options.getPreferredEditor;
    this.toolExecutor = new ToolExecutor(this.config);
    this.toolModifier = new ToolModificationHandler();
    this.state = new SchedulerStateManager(this.onToolCallsUpdate);

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

  private isRunning(): boolean {
    const firstActive = this.state.getFirstActiveCall();
    return (
      this.isFinalizingToolCalls ||
      (firstActive !== undefined &&
        (firstActive.status === 'executing' ||
          firstActive.status === 'awaiting_approval'))
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
    const activeCall = this.state.getFirstActiveCall();
    if (activeCall) {
      // Only cancel if it's in a cancellable state.
      if (
        activeCall.status === 'awaiting_approval' ||
        activeCall.status === 'executing' ||
        activeCall.status === 'scheduled' ||
        activeCall.status === 'validating'
      ) {
        this.state.updateStatus(
          activeCall.request.callId,
          'cancelled',
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
      this.state.clearBatch();

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
              startTime: Date.now(),
              durationMs: 0,
            } as ErroredToolCall;
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
              startTime: Date.now(),
              durationMs: 0,
            } as ErroredToolCall;
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

      this.state.enqueue(newToolCalls);
      await this._processNextInQueue(signal);
    } finally {
      this.isScheduling = false;
    }
  }

  private async _processNextInQueue(signal: AbortSignal): Promise<void> {
    // If there's already a tool being processed, or the queue is empty, stop.
    if (this.state.hasActiveCalls() || this.state.getQueueLength() === 0) {
      return;
    }

    // If cancellation happened between steps, handle it.
    if (signal.aborted) {
      this._cancelAllQueuedCalls();
      // Finalize the batch.
      await this.checkAndNotifyCompletion(signal);
      return;
    }

    const toolCall = this.state.dequeue()!;

    // Handle tools that were already errored during creation.
    if (toolCall.status === 'error') {
      // An error during validation means this "active" tool is already complete.
      // We need to check for batch completion to either finish or process the next in queue.
      this.state.updateStatus(
        toolCall.request.callId,
        'error',
        toolCall.response,
      );
      await this.checkAndNotifyCompletion(signal);
      return;
    }

    // This logic is moved from the old `for` loop in `_schedule`.
    if (toolCall.status === 'validating') {
      const { request: reqInfo, invocation } = toolCall;

      try {
        if (signal.aborted) {
          this.state.updateStatus(
            reqInfo.callId,
            'cancelled',
            'Tool call cancelled by user.',
          );
          // The completion check will handle the cascade.
          await this.checkAndNotifyCompletion(signal);
          return;
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
          this.state.updateStatus(
            reqInfo.callId,
            'error',
            createErrorResponse(
              reqInfo,
              new Error(errorMessage),
              ToolErrorType.POLICY_VIOLATION,
            ),
          );
          await this.checkAndNotifyCompletion(signal);
          return;
        }

        if (decision === PolicyDecision.ALLOW) {
          this.state.setOutcome(
            reqInfo.callId,
            ToolConfirmationOutcome.ProceedAlways,
          );
          this.state.updateStatus(reqInfo.callId, 'scheduled');
        } else {
          // PolicyDecision.ASK_USER

          // We need confirmation details to show to the user
          const confirmationDetails =
            await invocation.shouldConfirmExecute(signal);

          if (!confirmationDetails) {
            this.state.setOutcome(
              reqInfo.callId,
              ToolConfirmationOutcome.ProceedAlways,
            );
            this.state.updateStatus(reqInfo.callId, 'scheduled');
          } else {
            if (!this.config.isInteractive()) {
              throw new Error(
                `Tool execution for "${
                  toolCall.tool.displayName || toolCall.tool.name
                }" requires user confirmation, which is not supported in non-interactive mode.`,
              );
            }

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
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              confirmationDetails.ideConfirmation.then((resolution) => {
                if (resolution.status === 'accepted') {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  this.handleConfirmationResponse(
                    reqInfo.callId,
                    confirmationDetails.onConfirm,
                    ToolConfirmationOutcome.ProceedOnce,
                    signal,
                  );
                } else {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
            this.state.updateStatus(
              reqInfo.callId,
              'awaiting_approval',
              wrappedConfirmationDetails,
            );
          }
        }
      } catch (error) {
        if (signal.aborted) {
          this.state.updateStatus(
            reqInfo.callId,
            'cancelled',
            'Tool call cancelled by user.',
          );
          await this.checkAndNotifyCompletion(signal);
          return;
        } else {
          this.state.updateStatus(
            reqInfo.callId,
            'error',
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
    const toolCall = this.state
      .getSnapshot()
      .find(
        (c) => c.request.callId === callId && c.status === 'awaiting_approval',
      );

    if (toolCall && toolCall.status === 'awaiting_approval') {
      await originalOnConfirm(outcome);
    }

    this.state.setOutcome(callId, outcome);

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

      this.state.updateStatus(callId, 'awaiting_approval', {
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
        const invocationOrError = this.buildInvocation(
          waitingToolCall.tool,
          result.updatedParams,
        );
        if (!(invocationOrError instanceof Error)) {
          this.state.updateArgs(
            callId,
            result.updatedParams,
            invocationOrError,
          );
        }
        this.state.updateStatus(callId, 'awaiting_approval', {
          ...waitingToolCall.confirmationDetails,
          fileDiff: result.updatedDiff,
          isModifying: false,
        } as ToolCallConfirmationDetails);
      } else {
        this.state.updateStatus(callId, 'awaiting_approval', {
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
          const invocationOrError = this.buildInvocation(
            (toolCall as WaitingToolCall).tool,
            result.updatedParams,
          );
          if (!(invocationOrError instanceof Error)) {
            this.state.updateArgs(
              callId,
              result.updatedParams,
              invocationOrError,
            );
          }
          this.state.updateStatus(callId, 'awaiting_approval', {
            ...(toolCall as WaitingToolCall).confirmationDetails,
            fileDiff: result.updatedDiff,
          } as ToolCallConfirmationDetails);
          // After an inline modification, wait for another user confirmation.
          return;
        }
      }
      this.state.updateStatus(callId, 'scheduled');
    }
    await this.attemptExecutionOfScheduledCalls(signal);
  }

  private async attemptExecutionOfScheduledCalls(
    signal: AbortSignal,
  ): Promise<void> {
    const allCallsFinalOrScheduled = this.state.getSnapshot().every(
      (call) =>
        call.status === 'scheduled' ||
        call.status === 'cancelled' ||
        call.status === 'success' ||
        call.status === 'error' ||
        call.status === 'validating', // validating ones are in queue
    );

    if (allCallsFinalOrScheduled) {
      const callsToExecute = this.state
        .getSnapshot()
        .filter((call) => call.status === 'scheduled');

      for (const toolCall of callsToExecute) {
        if (toolCall.status !== 'scheduled') continue;

        this.state.updateStatus(toolCall.request.callId, 'executing');
        const executingCall = this.state
          .getSnapshot()
          .find((c) => c.request.callId === toolCall.request.callId);

        if (!executingCall || executingCall.status !== 'executing') {
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
            // Update live output in state manager
            this.state.updateStatus(callId, 'executing', {
              ...executingCall,
              liveOutput: output,
            });
          },
          onUpdateToolCall: (updatedCall) => {
            // This is a bit tricky since updateStatus handles transitions.
            // For general updates, we might need a more direct way or just use updateStatus with current status.
            this.state.updateStatus(
              updatedCall.request.callId,
              updatedCall.status,
              updatedCall,
            );
          },
        });

        this.state.updateStatus(
          completedCall.request.callId,
          completedCall.status,
          completedCall.response,
        );

        await this.checkAndNotifyCompletion(signal);
      }
    }
  }

  private async checkAndNotifyCompletion(signal: AbortSignal): Promise<void> {
    // This method is now only concerned with the single active tool call.
    if (!this.state.hasActiveCalls()) {
      // It's possible to be called when a batch is cancelled before any tool has started.
      if (signal.aborted && this.state.getQueueLength() > 0) {
        this._cancelAllQueuedCalls();
      }
    } else {
      const activeCall = this.state.getFirstActiveCall()!;
      const isTerminal =
        activeCall.status === 'success' ||
        activeCall.status === 'error' ||
        activeCall.status === 'cancelled';

      // If the active tool is not in a terminal state (e.g., it's 'executing' or 'awaiting_approval'),
      // then the scheduler is still busy or paused. We should not proceed.
      if (!isTerminal) {
        return;
      }

      // The state manager handles moving terminal calls to the completed batch
      // and removing them from the active map.
      logToolCall(
        this.config,
        new ToolCallEvent(activeCall as CompletedToolCall),
      );
      this.state.finalizeCall(activeCall.request.callId);
    }

    // Now, check if the entire batch is complete.
    // The batch is complete if the queue is empty or the operation was cancelled.
    if (this.state.getQueueLength() === 0 || signal.aborted) {
      if (signal.aborted) {
        this._cancelAllQueuedCalls();
      }

      const completedBatch = this.state.getCompletedBatch();

      // If there's nothing to report and we weren't cancelled, we can stop.
      // But if we were cancelled, we must proceed to potentially start the next queued request.
      if (completedBatch.length === 0 && !signal.aborted) {
        return;
      }

      if (this.onAllToolCallsComplete) {
        this.isFinalizingToolCalls = true;
        // Use the batch array, not the (now empty) active array.
        await this.onAllToolCallsComplete(completedBatch);
        this.state.clearBatch(); // Clear after reporting.
        this.isFinalizingToolCalls = false;
      }
      this.isCancelling = false;

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
    this.state.cancelAllQueued('User cancelled the operation.');
  }
}
