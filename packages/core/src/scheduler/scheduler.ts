/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SchedulerStateManager } from './state-manager.js';
import { resolveConfirmation } from './confirmation.js';
import { checkPolicy, updatePolicy, getPolicyDenialError } from './policy.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolModificationHandler } from './tool-modifier.js';
import {
  type ToolCallRequestInfo,
  type ToolCall,
  type ToolCallResponseInfo,
  type CompletedToolCall,
  type ExecutingToolCall,
  type ValidatingToolCall,
  type ErroredToolCall,
  CoreToolCallStatus,
  type ScheduledToolCall,
} from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type { ApprovalMode } from '../policy/types.js';
import { PolicyDecision } from '../policy/types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
} from '../tools/tools.js';
import { getToolSuggestion } from '../utils/tool-utils.js';
import { runInDevTraceSpan } from '../telemetry/trace.js';
import { logToolCall } from '../telemetry/loggers.js';
import { ToolCallEvent } from '../telemetry/types.js';
import type { EditorType } from '../utils/editor.js';
import {
  MessageBusType,
  type SerializableConfirmationDetails,
  type ToolConfirmationRequest,
} from '../confirmation-bus/types.js';
import { runWithToolCallContext } from '../utils/toolCallContext.js';
import {
  coreEvents,
  CoreEvent,
  type McpProgressPayload,
} from '../utils/events.js';

interface SchedulerQueueItem {
  requests: ToolCallRequestInfo[];
  signal: AbortSignal;
  resolve: (results: CompletedToolCall[]) => void;
  reject: (reason?: Error) => void;
}

export interface SchedulerOptions {
  config: Config;
  messageBus: MessageBus;
  getPreferredEditor: () => EditorType | undefined;
  schedulerId: string;
  parentCallId?: string;
  onWaitingForConfirmation?: (waiting: boolean) => void;
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

/**
 * Event-Driven Orchestrator for Tool Execution.
 * Coordinates execution via state updates and event listening.
 */
export class Scheduler {
  // Tracks which MessageBus instances have the legacy listener attached to prevent duplicates.
  private static subscribedMessageBuses = new WeakSet<MessageBus>();

  private readonly state: SchedulerStateManager;
  private readonly executor: ToolExecutor;
  private readonly modifier: ToolModificationHandler;
  private readonly config: Config;
  private readonly messageBus: MessageBus;
  private readonly getPreferredEditor: () => EditorType | undefined;
  private readonly schedulerId: string;
  private readonly parentCallId?: string;
  private readonly onWaitingForConfirmation?: (waiting: boolean) => void;

  private isProcessing = false;
  private isCancelling = false;
  private readonly requestQueue: SchedulerQueueItem[] = [];

  constructor(options: SchedulerOptions) {
    this.config = options.config;
    this.messageBus = options.messageBus;
    this.getPreferredEditor = options.getPreferredEditor;
    this.schedulerId = options.schedulerId;
    this.parentCallId = options.parentCallId;
    this.onWaitingForConfirmation = options.onWaitingForConfirmation;
    this.state = new SchedulerStateManager(
      this.messageBus,
      this.schedulerId,
      (call) => logToolCall(this.config, new ToolCallEvent(call)),
    );
    this.executor = new ToolExecutor(this.config);
    this.modifier = new ToolModificationHandler();

    this.setupMessageBusListener(this.messageBus);

    coreEvents.on(CoreEvent.McpProgress, this.handleMcpProgress);
  }

  dispose(): void {
    coreEvents.off(CoreEvent.McpProgress, this.handleMcpProgress);
  }

  private readonly handleMcpProgress = (payload: McpProgressPayload) => {
    const callId = payload.callId;
    this.state.updateStatus(callId, CoreToolCallStatus.Executing, {
      progressMessage: payload.message,
      progressPercent:
        payload.total && payload.total > 0
          ? (payload.progress / payload.total) * 100
          : undefined,
    });
  };

  private setupMessageBusListener(messageBus: MessageBus): void {
    if (Scheduler.subscribedMessageBuses.has(messageBus)) {
      return;
    }

    // TODO: Optimize policy checks. Currently, tools check policy via
    // MessageBus even though the Scheduler already checked it.
    messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      async (request: ToolConfirmationRequest) => {
        await messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: request.correlationId,
          confirmed: false,
          requiresUserConfirmation: true,
        });
      },
    );

    Scheduler.subscribedMessageBuses.add(messageBus);
  }

  /**
   * Schedules a batch of tool calls.
   * @returns A promise that resolves with the results of the completed batch.
   */
  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<CompletedToolCall[]> {
    return runInDevTraceSpan(
      { name: 'schedule' },
      async ({ metadata: spanMetadata }) => {
        const requests = Array.isArray(request) ? request : [request];
        spanMetadata.input = requests;

        if (this.isProcessing || this.state.isActive) {
          return this._enqueueRequest(requests, signal);
        }

        return this._startBatch(requests, signal);
      },
    );
  }

  private _enqueueRequest(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<CompletedToolCall[]> {
    return new Promise<CompletedToolCall[]>((resolve, reject) => {
      const abortHandler = () => {
        const index = this.requestQueue.findIndex(
          (item) => item.requests === requests,
        );
        if (index > -1) {
          this.requestQueue.splice(index, 1);
          reject(new Error('Tool call cancelled while in queue.'));
        }
      };

      if (signal.aborted) {
        reject(new Error('Operation cancelled'));
        return;
      }

      signal.addEventListener('abort', abortHandler, { once: true });

      this.requestQueue.push({
        requests,
        signal,
        resolve: (results) => {
          signal.removeEventListener('abort', abortHandler);
          resolve(results);
        },
        reject: (err) => {
          signal.removeEventListener('abort', abortHandler);
          reject(err);
        },
      });
    });
  }

  cancelAll(): void {
    if (this.isCancelling) return;
    this.isCancelling = true;

    // Clear scheduler request queue
    while (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift();
      next?.reject(new Error('Operation cancelled by user'));
    }

    // Cancel active calls
    const activeCalls = this.state.allActiveCalls;
    for (const activeCall of activeCalls) {
      if (!this.isTerminal(activeCall.status)) {
        this.state.updateStatus(
          activeCall.request.callId,
          CoreToolCallStatus.Cancelled,
          'Operation cancelled by user',
        );
      }
    }

    // Clear queue
    this.state.cancelAllQueued('Operation cancelled by user');
  }

  get completedCalls(): CompletedToolCall[] {
    return this.state.completedBatch;
  }

  private isTerminal(status: string) {
    return (
      status === CoreToolCallStatus.Success ||
      status === CoreToolCallStatus.Error ||
      status === CoreToolCallStatus.Cancelled
    );
  }

  // --- Phase 1: Ingestion & Resolution ---

  private async _startBatch(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<CompletedToolCall[]> {
    this.isProcessing = true;
    this.isCancelling = false;
    this.state.clearBatch();
    const currentApprovalMode = this.config.getApprovalMode();

    try {
      const toolRegistry = this.config.getToolRegistry();
      const newCalls: ToolCall[] = requests.map((request) => {
        const enrichedRequest: ToolCallRequestInfo = {
          ...request,
          schedulerId: this.schedulerId,
          parentCallId: this.parentCallId,
        };
        const tool = toolRegistry.getTool(request.name);

        if (!tool) {
          return {
            ...this._createToolNotFoundErroredToolCall(
              enrichedRequest,
              toolRegistry.getAllToolNames(),
            ),
            approvalMode: currentApprovalMode,
          };
        }

        return this._validateAndCreateToolCall(
          enrichedRequest,
          tool,
          currentApprovalMode,
        );
      });

      this.state.enqueue(newCalls);
      await this._processQueue(signal);
      return this.state.completedBatch;
    } finally {
      this.isProcessing = false;
      this.state.clearBatch();
      this._processNextInRequestQueue();
    }
  }

  private _createToolNotFoundErroredToolCall(
    request: ToolCallRequestInfo,
    toolNames: string[],
  ): ErroredToolCall {
    const suggestion = getToolSuggestion(request.name, toolNames);
    return {
      status: CoreToolCallStatus.Error,
      request,
      response: createErrorResponse(
        request,
        new Error(`Tool "${request.name}" not found.${suggestion}`),
        ToolErrorType.TOOL_NOT_REGISTERED,
      ),
      durationMs: 0,
      schedulerId: this.schedulerId,
    };
  }

  private _validateAndCreateToolCall(
    request: ToolCallRequestInfo,
    tool: AnyDeclarativeTool,
    approvalMode: ApprovalMode,
  ): ValidatingToolCall | ErroredToolCall {
    return runWithToolCallContext(
      {
        callId: request.callId,
        schedulerId: this.schedulerId,
        parentCallId: this.parentCallId,
      },
      () => {
        try {
          const invocation = tool.build(request.args);
          return {
            status: CoreToolCallStatus.Validating,
            request,
            tool,
            invocation,
            startTime: Date.now(),
            schedulerId: this.schedulerId,
            approvalMode,
          };
        } catch (e) {
          return {
            status: CoreToolCallStatus.Error,
            request,
            tool,
            response: createErrorResponse(
              request,
              e instanceof Error ? e : new Error(String(e)),
              ToolErrorType.INVALID_TOOL_PARAMS,
            ),
            durationMs: 0,
            schedulerId: this.schedulerId,
            approvalMode,
          };
        }
      },
    );
  }

  // --- Phase 2: Processing Loop ---

  private async _processQueue(signal: AbortSignal): Promise<void> {
    while (this.state.queueLength > 0 || this.state.isActive) {
      const shouldContinue = await this._processNextItem(signal);
      if (!shouldContinue) break;
    }
  }

  /**
   * Processes the next item in the queue.
   * @returns true if the loop should continue, false if it should terminate.
   */
  private async _processNextItem(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || this.isCancelling) {
      this.state.cancelAllQueued('Operation cancelled');
      return false;
    }

    const initialStatuses = new Map(
      this.state.allActiveCalls.map((c) => [c.request.callId, c.status]),
    );

    if (!this.state.isActive) {
      const next = this.state.dequeue();
      if (!next) return false;

      if (next.status === CoreToolCallStatus.Error) {
        this.state.updateStatus(
          next.request.callId,
          CoreToolCallStatus.Error,
          next.response,
        );
        this.state.finalizeCall(next.request.callId);
        return true;
      }

      // If the first tool is read-only, batch all contiguous read-only tools.
      if (next.tool?.isReadOnly) {
        while (this.state.queueLength > 0) {
          const peeked = this.state.peekQueue();
          if (peeked && peeked.tool?.isReadOnly) {
            this.state.dequeue();
          } else {
            break;
          }
        }
      }
    }

    // Now we have one or more active calls. Move them through the lifecycle
    // as much as possible in this iteration.

    // 1. Process all 'validating' calls (Policy & Confirmation)
    let activeCalls = this.state.allActiveCalls;
    const validatingCalls = activeCalls.filter(
      (c): c is ValidatingToolCall =>
        c.status === CoreToolCallStatus.Validating,
    );
    if (validatingCalls.length > 0) {
      await Promise.all(
        validatingCalls.map((c) => this._processValidatingCall(c, signal)),
      );
    }

    // 2. Execute scheduled calls
    // Refresh activeCalls as status might have changed to 'scheduled'
    activeCalls = this.state.allActiveCalls;
    const scheduledCalls = activeCalls.filter(
      (c): c is ScheduledToolCall => c.status === CoreToolCallStatus.Scheduled,
    );

    // We only execute if ALL active calls are in a ready state (scheduled or terminal)
    const allReady = activeCalls.every(
      (c) =>
        c.status === CoreToolCallStatus.Scheduled || this.isTerminal(c.status),
    );

    if (allReady && scheduledCalls.length > 0) {
      await Promise.all(scheduledCalls.map((c) => this._execute(c, signal)));
    }

    // 3. Finalize terminal calls
    activeCalls = this.state.allActiveCalls;
    let madeProgress = false;
    for (const call of activeCalls) {
      if (this.isTerminal(call.status)) {
        this.state.finalizeCall(call.request.callId);
        madeProgress = true;
      }
    }

    // Check if any calls changed status during this iteration (excluding terminal finalization)
    const currentStatuses = new Map(
      activeCalls.map((c) => [c.request.callId, c.status]),
    );
    const anyStatusChanged = Array.from(initialStatuses.entries()).some(
      ([id, status]) => currentStatuses.get(id) !== status,
    );

    if (madeProgress || anyStatusChanged) {
      return true;
    }

    // If we have active calls but NONE of them progressed, check if we are waiting for external events.
    // States that are 'waiting' from the loop's perspective: awaiting_approval, executing.
    const isWaitingForExternal = activeCalls.some(
      (c) =>
        c.status === CoreToolCallStatus.AwaitingApproval ||
        c.status === CoreToolCallStatus.Executing,
    );

    if (isWaitingForExternal && this.state.isActive) {
      // Yield to the event loop to allow external events (tool completion, user input) to progress.
      await new Promise((resolve) => queueMicrotask(() => resolve(true)));
      return true;
    }

    // If we are here, we have active calls (likely Validating or Scheduled) but none progressed.
    // This is a stuck state.
    return false;
  }

  private async _processValidatingCall(
    active: ValidatingToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this._processToolCall(active, signal);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // If the signal aborted while we were waiting on something, treat as
      // cancelled. Otherwise, it's a genuine unhandled system exception.
      if (signal.aborted || err.name === 'AbortError') {
        this.state.updateStatus(
          active.request.callId,
          CoreToolCallStatus.Cancelled,
          'Operation cancelled',
        );
      } else {
        this.state.updateStatus(
          active.request.callId,
          CoreToolCallStatus.Error,
          createErrorResponse(
            active.request,
            err,
            ToolErrorType.UNHANDLED_EXCEPTION,
          ),
        );
      }
    }
  }

  // --- Phase 3: Single Call Orchestration ---

  private async _processToolCall(
    toolCall: ValidatingToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    const callId = toolCall.request.callId;

    // Policy & Security
    const { decision, rule } = await checkPolicy(toolCall, this.config);

    if (decision === PolicyDecision.DENY) {
      const { errorMessage, errorType } = getPolicyDenialError(
        this.config,
        rule,
      );

      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Error,
        createErrorResponse(
          toolCall.request,
          new Error(errorMessage),
          errorType,
        ),
      );
      return;
    }

    // User Confirmation Loop
    let outcome = ToolConfirmationOutcome.ProceedOnce;
    let lastDetails: SerializableConfirmationDetails | undefined;

    if (decision === PolicyDecision.ASK_USER) {
      const result = await resolveConfirmation(toolCall, signal, {
        config: this.config,
        messageBus: this.messageBus,
        state: this.state,
        modifier: this.modifier,
        getPreferredEditor: this.getPreferredEditor,
        schedulerId: this.schedulerId,
        onWaitingForConfirmation: this.onWaitingForConfirmation,
      });
      outcome = result.outcome;
      lastDetails = result.lastDetails;
    }

    this.state.setOutcome(callId, outcome);

    // Handle Policy Updates
    if (decision === PolicyDecision.ASK_USER && outcome) {
      await updatePolicy(toolCall.tool, outcome, lastDetails, {
        config: this.config,
        messageBus: this.messageBus,
      });
    }

    // Handle cancellation (cascades to entire batch)
    if (outcome === ToolConfirmationOutcome.Cancel) {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Cancelled,
        'User denied execution.',
      );
      this.state.cancelAllQueued('User cancelled operation');
      return; // Skip execution
    }

    this.state.updateStatus(callId, CoreToolCallStatus.Scheduled);
  }

  // --- Sub-phase Handlers ---

  /**
   * Executes the tool and records the result.
   */
  private async _execute(
    toolCall: ScheduledToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    const callId = toolCall.request.callId;
    if (signal.aborted) {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Cancelled,
        'Operation cancelled',
      );
      return;
    }
    this.state.updateStatus(callId, CoreToolCallStatus.Executing);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const activeCall = this.state.getToolCall(callId) as ExecutingToolCall;

    const result = await runWithToolCallContext(
      {
        callId: activeCall.request.callId,
        schedulerId: this.schedulerId,
        parentCallId: this.parentCallId,
      },
      () =>
        this.executor.execute({
          call: activeCall,
          signal,
          outputUpdateHandler: (id, out) =>
            this.state.updateStatus(id, CoreToolCallStatus.Executing, {
              liveOutput: out,
            }),
          onUpdateToolCall: (updated) => {
            if (
              updated.status === CoreToolCallStatus.Executing &&
              updated.pid
            ) {
              this.state.updateStatus(callId, CoreToolCallStatus.Executing, {
                pid: updated.pid,
              });
            }
          },
        }),
    );

    if (result.status === CoreToolCallStatus.Success) {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Success,
        result.response,
      );
    } else if (result.status === CoreToolCallStatus.Cancelled) {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Cancelled,
        'Operation cancelled',
      );
    } else {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Error,
        result.response,
      );
    }
  }

  private _processNextInRequestQueue() {
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift()!;
      this.schedule(next.requests, next.signal)
        .then(next.resolve)
        .catch(next.reject);
    }
  }
}
