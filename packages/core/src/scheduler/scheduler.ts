/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SchedulerStateManager } from './state-manager.js';
import { resolveConfirmation } from './confirmation.js';
import { checkPolicy, updatePolicy, getPolicyDenialError } from './policy.js';
import { evaluateBeforeToolHook } from './hook-utils.js';
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
  type SuccessfulToolCall,
  CoreToolCallStatus,
  type ScheduledToolCall,
} from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { UPDATE_TOPIC_TOOL_NAME } from '../tools/tool-names.js';
import { PolicyDecision, type ApprovalMode } from '../policy/types.js';
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
import { GeminiCliOperation } from '../telemetry/constants.js';

interface SchedulerQueueItem {
  requests: ToolCallRequestInfo[];
  signal: AbortSignal;
  resolve: (results: CompletedToolCall[]) => void;
  reject: (reason?: Error) => void;
}

export interface SchedulerOptions {
  context: AgentLoopContext;
  messageBus?: MessageBus;
  getPreferredEditor: () => EditorType | undefined;
  schedulerId: string;
  subagent?: string;
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
        name: request.originalRequestName ?? request.name,
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
  private readonly context: AgentLoopContext;
  private readonly messageBus: MessageBus;
  private readonly getPreferredEditor: () => EditorType | undefined;
  private readonly schedulerId: string;
  private readonly subagent?: string;
  private readonly parentCallId?: string;
  private readonly onWaitingForConfirmation?: (waiting: boolean) => void;

  private isProcessing = false;
  private isCancelling = false;
  private readonly requestQueue: SchedulerQueueItem[] = [];

  constructor(options: SchedulerOptions) {
    this.context = options.context;
    this.config = this.context.config;
    this.messageBus = options.messageBus ?? this.context.messageBus;
    this.getPreferredEditor = options.getPreferredEditor;
    this.schedulerId = options.schedulerId;
    this.subagent = options.subagent;
    this.parentCallId = options.parentCallId;
    this.onWaitingForConfirmation = options.onWaitingForConfirmation;
    this.state = new SchedulerStateManager(
      this.messageBus,
      this.schedulerId,
      (call) => logToolCall(this.config, new ToolCallEvent(call)),
    );
    this.executor = new ToolExecutor(this.context);
    this.modifier = new ToolModificationHandler();

    this.setupMessageBusListener(this.messageBus);

    coreEvents.on(CoreEvent.McpProgress, this.handleMcpProgress);
  }

  dispose(): void {
    coreEvents.off(CoreEvent.McpProgress, this.handleMcpProgress);
  }

  private readonly handleMcpProgress = (payload: McpProgressPayload) => {
    const { callId } = payload;

    const call = this.state.getToolCall(callId);
    if (!call || call.status !== CoreToolCallStatus.Executing) {
      return;
    }

    const validTotal =
      payload.total !== undefined &&
      Number.isFinite(payload.total) &&
      payload.total > 0
        ? payload.total
        : undefined;

    this.state.updateStatus(callId, CoreToolCallStatus.Executing, {
      progressMessage: payload.message,
      progressPercent: validTotal
        ? Math.min(100, (payload.progress / validTotal) * 100)
        : undefined,
      progress: payload.progress,
      progressTotal: validTotal,
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
      {
        operation: GeminiCliOperation.ScheduleToolCalls,
        logPrompts: this.context.config.getTelemetryLogPromptsEnabled(),
      },
      async ({ metadata: spanMetadata }) => {
        const requests = Array.isArray(request) ? request : [request];

        spanMetadata.input = requests;

        let toolCallResponse: CompletedToolCall[] = [];

        if (this.isProcessing || this.state.isActive) {
          toolCallResponse = await this._enqueueRequest(requests, signal);
        } else {
          toolCallResponse = await this._startBatch(requests, signal);
        }

        spanMetadata.output = toolCallResponse;
        return toolCallResponse;
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

    // Sort requests to ensure Topic changes happen before actions in the same batch.
    const sortedRequests = [...requests].sort((a, b) => {
      if (a.name === UPDATE_TOPIC_TOOL_NAME) return -1;
      if (b.name === UPDATE_TOPIC_TOOL_NAME) return 1;
      return 0;
    });

    try {
      const toolRegistry = this.context.toolRegistry;
      const newCalls: ToolCall[] = sortedRequests.map((request) => {
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
        subagent: this.subagent,
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

      // If the first tool is parallelizable, batch all contiguous parallelizable tools.
      if (this._isParallelizable(next.request)) {
        while (this.state.queueLength > 0) {
          const peeked = this.state.peekQueue();
          if (peeked && this._isParallelizable(peeked.request)) {
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

    let madeProgress = false;
    if (allReady && scheduledCalls.length > 0) {
      const execResults = await Promise.all(
        scheduledCalls.map((c) => this._execute(c, signal)),
      );
      madeProgress = execResults.some((res) => res);
    }

    // 3. Finalize terminal calls
    activeCalls = this.state.allActiveCalls;
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

  private _isParallelizable(request: ToolCallRequestInfo): boolean {
    if (request.args) {
      const wait = request.args['wait_for_previous'];
      if (typeof wait === 'boolean') {
        return !wait;
      }
    }

    // Default to parallel if the flag is omitted.
    return true;
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

    // 1. Hook Check (BeforeTool)
    const hookResult = await evaluateBeforeToolHook(
      this.config,
      toolCall.tool,
      toolCall.request,
      toolCall.invocation,
    );

    if (hookResult.status === 'error') {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Error,
        createErrorResponse(
          toolCall.request,
          hookResult.error,
          hookResult.errorType,
        ),
      );
      return;
    }

    const { hookDecision, hookSystemMessage, modifiedArgs, newInvocation } =
      hookResult;

    if (modifiedArgs && newInvocation) {
      toolCall.request.args = modifiedArgs;
      toolCall.request.inputModifiedByHook = true;
      toolCall.invocation = newInvocation;
    }

    // 2. Policy & Security
    const { decision: policyDecision, rule } = await checkPolicy(
      toolCall,
      this.config,
      this.subagent,
    );
    let decision = policyDecision;
    if (hookDecision === 'ask') {
      decision = PolicyDecision.ASK_USER;
    }

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
        systemMessage: hookSystemMessage,
        forcedDecision: hookDecision === 'ask' ? 'ask_user' : undefined,
      });
      outcome = result.outcome;
      lastDetails = result.lastDetails;
    }

    this.state.setOutcome(callId, outcome);

    // Handle Policy Updates
    if (decision === PolicyDecision.ASK_USER && outcome) {
      await updatePolicy(
        toolCall.tool,
        outcome,
        lastDetails,
        this.context,
        this.messageBus,
        toolCall.invocation,
      );
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
   * Executes the tool and records the result. Returns true if a new tool call was added.
   */
  private async _execute(
    toolCall: ScheduledToolCall,
    signal: AbortSignal,
  ): Promise<boolean> {
    const callId = toolCall.request.callId;
    if (signal.aborted) {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Cancelled,
        'Operation cancelled',
      );
      return false;
    }
    this.state.updateStatus(callId, CoreToolCallStatus.Executing);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const activeCall = this.state.getToolCall(callId) as ExecutingToolCall;

    const result = await runWithToolCallContext(
      {
        callId: activeCall.request.callId,
        schedulerId: this.schedulerId,
        parentCallId: this.parentCallId,
        subagent: this.subagent,
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

    if (
      (result.status === CoreToolCallStatus.Success ||
        result.status === CoreToolCallStatus.Error) &&
      result.tailToolCallRequest
    ) {
      // Log the intermediate tool call before it gets replaced.
      const intermediateCall: SuccessfulToolCall | ErroredToolCall = {
        request: activeCall.request,
        tool: activeCall.tool,
        invocation: activeCall.invocation,
        status: result.status,
        response: result.response,
        durationMs: activeCall.startTime
          ? Date.now() - activeCall.startTime
          : undefined,
        outcome: activeCall.outcome,
        schedulerId: this.schedulerId,
      };
      logToolCall(this.config, new ToolCallEvent(intermediateCall));

      const tailRequest = result.tailToolCallRequest;
      const originalCallId = result.request.callId;
      const originalRequestName =
        result.request.originalRequestName || result.request.name;

      const newTool = this.context.toolRegistry.getTool(tailRequest.name);

      const newRequest: ToolCallRequestInfo = {
        callId: originalCallId,
        name: tailRequest.name,
        args: tailRequest.args,
        originalRequestName,
        originalRequestArgs:
          result.request.originalRequestArgs ?? result.request.args,
        isClientInitiated: result.request.isClientInitiated,
        prompt_id: result.request.prompt_id,
        schedulerId: this.schedulerId,
      };

      if (!newTool) {
        // Enqueue an errored tool call
        const errorCall = this._createToolNotFoundErroredToolCall(
          newRequest,
          this.context.toolRegistry.getAllToolNames(),
        );
        this.state.replaceActiveCallWithTailCall(callId, errorCall);
      } else {
        // Enqueue a validating tool call for the new tail tool
        const validatingCall = this._validateAndCreateToolCall(
          newRequest,
          newTool,
          activeCall.approvalMode ?? this.config.getApprovalMode(),
        );
        this.state.replaceActiveCallWithTailCall(callId, validatingCall);
      }

      // Loop continues, picking up the new tail call at the front of the queue.
      return true;
    }

    let isSandboxError = false;
    let sandboxDetailsStr = '';

    if (
      result.status === CoreToolCallStatus.Error &&
      result.response.errorType === 'sandbox_expansion_required'
    ) {
      isSandboxError = true;
      sandboxDetailsStr = result.response.error?.message || '';
    }

    if (isSandboxError) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsedError = JSON.parse(sandboxDetailsStr) as {
          rootCommand: string;
          additionalPermissions: import('../services/sandboxManager.js').SandboxPermissions;
        };

        const confirmationDetails: SerializableConfirmationDetails = {
          type: 'sandbox_expansion',
          title: 'Sandbox Expansion Request',
          command: String(
            activeCall.request.args['command'] ?? parsedError.rootCommand,
          ),
          rootCommand: parsedError.rootCommand,
          additionalPermissions: parsedError.additionalPermissions,
        };

        const correlationId = crypto.randomUUID();

        // Mutate the active call so resolveConfirmation generates the correct Sandbox Expansion details
        activeCall.request.args['additional_permissions'] =
          parsedError.additionalPermissions;
        activeCall.invocation = activeCall.tool.build(activeCall.request.args);

        // CRITICAL: We must push the new args and invocation into the state manager
        // before calling resolveConfirmation, because resolveConfirmation fetches
        // the tool call directly from the state manager!
        this.state.updateArgs(
          callId,
          activeCall.request.args,
          activeCall.invocation,
        );

        this.state.updateStatus(callId, CoreToolCallStatus.AwaitingApproval, {
          confirmationDetails,
          correlationId,
        });

        const validatingCall = {
          ...activeCall,
          status: CoreToolCallStatus.Validating,
        } as ValidatingToolCall;

        const confResult = await resolveConfirmation(validatingCall, signal, {
          config: this.config,
          messageBus: this.messageBus,
          state: this.state,
          modifier: this.modifier,
          getPreferredEditor: this.getPreferredEditor,
          schedulerId: this.schedulerId,
          onWaitingForConfirmation: this.onWaitingForConfirmation,
        });

        if (confResult.outcome === ToolConfirmationOutcome.Cancel) {
          type LegacyHack = ToolCallResponseInfo & {
            llmContent?: string;
            returnDisplay?: string;
          };
          const errorResponse = { ...result.response } as LegacyHack;
          errorResponse.llmContent =
            'User cancelled sandbox expansion. The command failed with a sandbox denial. Shell output:\n' +
            String(errorResponse.returnDisplay);

          this.state.updateStatus(
            callId,
            CoreToolCallStatus.Error,
            errorResponse,
          );
          return false;
        }

        activeCall.request.args['additional_permissions'] =
          parsedError.additionalPermissions;

        // Reset the output stream visual so it replaces the error text
        this.state.updateStatus(callId, CoreToolCallStatus.Executing, {
          liveOutput: undefined,
        });

        // Call _execute synchronously and properly return its promise to loop internally!
        return await this._execute(
          {
            ...activeCall,
            status: CoreToolCallStatus.Scheduled,
          } as ScheduledToolCall,
          signal,
        );
      } catch (_e) {
        // Fallback to normal error handling if parsing/looping fails
      }
    }

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
        result.response,
      );
    } else {
      this.state.updateStatus(
        callId,
        CoreToolCallStatus.Error,
        result.response,
      );
    }
    return false;
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
