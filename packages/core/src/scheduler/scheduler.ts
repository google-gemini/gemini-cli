/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SchedulerStateManager } from './state-manager.js';
import { ConfirmationCoordinator } from './confirmation-coordinator.js';
import { ToolExecutor } from './tool-executor.js';
import { ToolModificationHandler } from './tool-modifier.js';
import {
  type ToolCallRequestInfo,
  type ToolCall,
  type ToolCallResponseInfo,
  type CompletedToolCall,
  type WaitingToolCall,
  type ExecutingToolCall,
  type ValidatingToolCall,
  type ErroredToolCall,
} from './types.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type PolicyUpdateOptions,
  type ToolCallConfirmationDetails,
  type ToolConfirmationPayload,
} from '../tools/tools.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { AUTO_EDIT_TOOLS } from '../tools/tool-names.js';
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
import { fireToolNotificationHook } from '../core/coreToolHookTriggers.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface SchedulerOptions {
  config: Config;
  messageBus: MessageBus;
  getPreferredEditor: () => EditorType | undefined;
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
  private readonly state: SchedulerStateManager;
  private readonly coordinator: ConfirmationCoordinator;
  private readonly executor: ToolExecutor;
  private readonly modifier: ToolModificationHandler;
  private readonly config: Config;
  private readonly messageBus: MessageBus;
  private readonly getPreferredEditor: () => EditorType | undefined;

  private isProcessing = false;
  private isCancelling = false;
  private readonly requestQueue: Array<{
    requests: ToolCallRequestInfo[];
    signal: AbortSignal;
    resolve: () => void;
    reject: (reason?: Error) => void;
  }> = [];

  constructor(options: SchedulerOptions) {
    this.config = options.config;
    this.messageBus = options.messageBus;
    this.getPreferredEditor = options.getPreferredEditor;
    this.state = new SchedulerStateManager(this.messageBus);
    this.coordinator = new ConfirmationCoordinator(this.messageBus);
    this.executor = new ToolExecutor(this.config);
    this.modifier = new ToolModificationHandler();

    // TODO: Optimize policy checks. Currently, tools check policy via MessageBus
    // even though the Scheduler already checked it. See associated issue for details.
    this.messageBus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      async (request: ToolConfirmationRequest) => {
        await this.messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: request.correlationId,
          confirmed: false,
          requiresUserConfirmation: true,
        });
      },
    );
  }

  /**
   * Schedules a batch of tool calls.
   */
  async schedule(
    request: ToolCallRequestInfo | ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    return runInDevTraceSpan(
      { name: 'schedule' },
      async ({ metadata: spanMetadata }) => {
        const requests = Array.isArray(request) ? request : [request];
        spanMetadata.input = requests;

        if (this.isProcessing || this.state.hasActiveCalls()) {
          return new Promise((resolve, reject) => {
            const abortHandler = () => {
              const index = this.requestQueue.findIndex(
                (item) => item.requests === requests,
              );
              if (index > -1) {
                this.requestQueue.splice(index, 1);
                reject(new Error('Tool call cancelled while in queue.'));
              }
            };

            signal.addEventListener('abort', abortHandler, { once: true });

            this.requestQueue.push({
              requests,
              signal,
              resolve: () => {
                signal.removeEventListener('abort', abortHandler);
                resolve();
              },
              reject: (err) => {
                signal.removeEventListener('abort', abortHandler);
                reject(err);
              },
            });
          });
        }

        return this._startBatch(requests, signal);
      },
    );
  }

  cancelAll(): void {
    if (this.isCancelling) return;
    this.isCancelling = true;

    // Clear scheduler request queue
    while (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift();
      next?.reject(new Error('Operation cancelled by user'));
    }

    // Cancel active call
    const activeCall = this.state.getFirstActiveCall();
    if (activeCall && !this.isTerminal(activeCall.status)) {
      this.state.updateStatus(
        activeCall.request.callId,
        'cancelled',
        'Operation cancelled by user',
      );
      this.state.finalizeCall(activeCall.request.callId);
    }

    // Clear queue
    this.state.cancelAllQueued('Operation cancelled by user');
  }

  getCompletedCalls(): CompletedToolCall[] {
    return this.state.getCompletedBatch();
  }

  private isTerminal(status: string) {
    return status === 'success' || status === 'error' || status === 'cancelled';
  }

  // --- Phase 1: Ingestion & Resolution ---

  private async _startBatch(
    requests: ToolCallRequestInfo[],
    signal: AbortSignal,
  ): Promise<void> {
    this.isProcessing = true;
    this.isCancelling = false;
    this.state.clearBatch();

    try {
      const toolRegistry = this.config.getToolRegistry();
      const newCalls: ToolCall[] = requests.map((request) => {
        const tool = toolRegistry.getTool(request.name);

        if (!tool) {
          return this._createToolNotFoundErroredToolCall(
            request,
            toolRegistry.getAllToolNames(),
          );
        }

        return this._validateAndCreateToolCall(request, tool);
      });

      this.state.enqueue(newCalls);
      await this._processQueue(signal);
    } finally {
      this.isProcessing = false;
      this._processNextInRequestQueue();
    }
  }

  private _createToolNotFoundErroredToolCall(
    request: ToolCallRequestInfo,
    toolNames: string[],
  ): ErroredToolCall {
    const suggestion = getToolSuggestion(request.name, toolNames);
    return {
      status: 'error',
      request,
      response: createErrorResponse(
        request,
        new Error(`Tool "${request.name}" not found.${suggestion}`),
        ToolErrorType.TOOL_NOT_REGISTERED,
      ),
      durationMs: 0,
    };
  }

  private _validateAndCreateToolCall(
    request: ToolCallRequestInfo,
    tool: AnyDeclarativeTool,
  ): ValidatingToolCall | ErroredToolCall {
    try {
      const invocation = tool.build(request.args);
      return {
        status: 'validating',
        request,
        tool,
        invocation,
        startTime: Date.now(),
      };
    } catch (e) {
      return {
        status: 'error',
        request,
        tool,
        response: createErrorResponse(
          request,
          e instanceof Error ? e : new Error(String(e)),
          ToolErrorType.INVALID_TOOL_PARAMS,
        ),
        durationMs: 0,
      };
    }
  }

  // --- Phase 2: Processing Loop ---

  private async _processQueue(signal: AbortSignal): Promise<void> {
    while (this.state.getQueueLength() > 0 || this.state.hasActiveCalls()) {
      if (signal.aborted || this.isCancelling) {
        this.state.cancelAllQueued('Operation cancelled');
        break;
      }

      if (!this.state.hasActiveCalls()) {
        const next = this.state.dequeue();
        if (!next) break;

        if (next.status === 'error') {
          this.state.updateStatus(next.request.callId, 'error', next.response);
          this.state.finalizeCall(next.request.callId);
          continue;
        }
      }

      const active = this.state.getFirstActiveCall();
      if (!active) break;

      if (active.status === 'validating') {
        try {
          await this._processToolCall(active, signal);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          // If the signal aborted while we were waiting on something, treat as cancelled.
          // Otherwise, it's a genuine unhandled system exception.
          if (signal.aborted || err.name === 'AbortError') {
            this.state.updateStatus(
              active.request.callId,
              'cancelled',
              'Operation cancelled',
            );
          } else {
            this.state.updateStatus(
              active.request.callId,
              'error',
              createErrorResponse(
                active.request,
                err,
                ToolErrorType.UNHANDLED_EXCEPTION,
              ),
            );
          }
        }

        // Fetch the updated call from state before finalizing to capture the terminal status
        const terminalCall = this.state.getToolCall(active.request.callId);
        if (terminalCall && this.isTerminal(terminalCall.status)) {
          logToolCall(
            this.config,
            new ToolCallEvent(terminalCall as CompletedToolCall),
          );
        }

        this.state.finalizeCall(active.request.callId);
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
    const decision = await this._checkPolicy(toolCall);

    if (decision === PolicyDecision.DENY) {
      this.state.updateStatus(
        callId,
        'error',
        createErrorResponse(
          toolCall.request,
          new Error('Tool execution denied by policy.'),
          ToolErrorType.POLICY_VIOLATION,
        ),
      );
      return;
    }

    // Interactive Loop
    let outcome = ToolConfirmationOutcome.ProceedOnce;
    if (decision === PolicyDecision.ASK_USER) {
      outcome = await this._resolveConfirmation(toolCall, signal);
    } else {
      this.state.setOutcome(callId, ToolConfirmationOutcome.ProceedOnce);
    }

    // Handle cancellation (cascades to entire batch)
    if (outcome === ToolConfirmationOutcome.Cancel) {
      this.state.updateStatus(callId, 'cancelled', 'User denied execution.');
      this.state.cancelAllQueued('User cancelled operation');
      return; // Skip execution
    }

    // Execution
    await this._execute(callId, signal);
  }

  // --- Sub-Phase Handlers ---

  /**
   * Queries the system PolicyEngine to determine tool allowance.
   * @returns The PolicyDecision.
   * @throws Error if policy requires ASK_USER but the CLI is non-interactive.
   */
  private async _checkPolicy(
    toolCall: ValidatingToolCall,
  ): Promise<PolicyDecision> {
    const serverName =
      toolCall.tool instanceof DiscoveredMCPTool
        ? toolCall.tool.serverName
        : undefined;

    const { decision } = await this.config
      .getPolicyEngine()
      .check(
        { name: toolCall.request.name, args: toolCall.request.args },
        serverName,
      );

    if (decision === PolicyDecision.ASK_USER) {
      // This is defensive. This should never happen b/c the policy engine
      // should always return DENY if the config is not interactive.
      if (!this.config.isInteractive()) {
        throw new Error(
          `Tool execution for "${
            toolCall.tool.displayName || toolCall.tool.name
          }" requires user confirmation, which is not supported in non-interactive mode.`,
        );
      }
    }

    return decision;
  }

  /**
   * Manages the interactive confirmation loop, handling user modifications
   * via inline diffs or external editors (Vim).
   * @returns The final outcome selected by the user.
   */
  private async _resolveConfirmation(
    toolCall: ValidatingToolCall,
    signal: AbortSignal,
  ): Promise<ToolConfirmationOutcome> {
    const callId = toolCall.request.callId;
    let outcome = ToolConfirmationOutcome.ModifyWithEditor;
    let lastSerializableDetails: SerializableConfirmationDetails | undefined;

    // Loop exists to allow the user to modify the parameters and see the new diff.
    while (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
      if (signal.aborted) throw new Error('Operation cancelled');

      const details = await toolCall.invocation.shouldConfirmExecute(signal);
      if (!details) {
        outcome = ToolConfirmationOutcome.ProceedOnce;
        break;
      }

      // 1. Fire Hook Notifications before pausing
      if (this.config.getEnableHooks()) {
        // TODO - We need to fix this once we remove the callback version of
        // coreToolScheduler.
        // The cast is needed because the legacy hook expects ToolCallConfirmationDetails
        // with the 'onConfirm' function. The new architecture doesn't use it,
        // but we satisfy the interface.
        await fireToolNotificationHook(this.messageBus, {
          ...details,
          onConfirm: async () => {},
        } as ToolCallConfirmationDetails);
      }

      const correlationId = randomUUID();
      const serializableDetails = details as SerializableConfirmationDetails;
      lastSerializableDetails = serializableDetails;

      const ideConfirmation =
        'ideConfirmation' in details ? details.ideConfirmation : undefined;

      // Publish State
      this.state.updateStatus(callId, 'awaiting_approval', {
        confirmationDetails: serializableDetails,
        correlationId,
      });

      // Await response
      const response = await this._waitForConfirmation(
        correlationId,
        signal,
        ideConfirmation,
      );
      outcome = response.outcome;

      // Handle Modifications
      if (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
        const editor = this.getPreferredEditor();
        if (editor) {
          const result = await this.modifier.handleModifyWithEditor(
            this.state.getFirstActiveCall() as WaitingToolCall,
            editor,
            signal,
          );
          if (result) {
            const newInvocation = toolCall.tool.build(result.updatedParams);
            this.state.updateArgs(callId, result.updatedParams, newInvocation);
          }
        }
      } else if (response.payload?.newContent) {
        const result = await this.modifier.applyInlineModify(
          this.state.getFirstActiveCall() as WaitingToolCall,
          response.payload,
          signal,
        );
        if (result) {
          const newInvocation = toolCall.tool.build(result.updatedParams);
          this.state.updateArgs(callId, result.updatedParams, newInvocation);
        }
        outcome = ToolConfirmationOutcome.ProceedOnce;
      }
    }

    this.state.setOutcome(callId, outcome);
    await this._handlePolicyUpdate(
      toolCall.tool,
      outcome,
      lastSerializableDetails,
    );
    return outcome;
  }

  /**
   * Evaluates the outcome of a user confirmation and dispatches
   * policy config updates.
   */
  private async _handlePolicyUpdate(
    tool: AnyDeclarativeTool,
    outcome: ToolConfirmationOutcome,
    confirmationDetails?: SerializableConfirmationDetails,
  ): Promise<void> {
    // Mode Transitions (AUTO_EDIT)
    if (this._isAutoEditTransition(tool, outcome)) {
      this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
      return;
    }

    // Specialized Tools (MCP)
    if (confirmationDetails?.type === 'mcp') {
      await this._handleMcpPolicyUpdate(tool, outcome, confirmationDetails);
      return;
    }

    // Generic Fallback (Shell, Info, etc.)
    await this._handleStandardPolicyUpdate(tool, outcome, confirmationDetails);
  }

  /**
   * Returns true if the user's 'Always Allow' selection for a specific tool
   * should trigger a session-wide transition to AUTO_EDIT mode.
   */
  private _isAutoEditTransition(
    tool: AnyDeclarativeTool,
    outcome: ToolConfirmationOutcome,
  ): boolean {
    // TODO: This is a temporary fix to enable AUTO_EDIT mode for specific
    // tools. We should refactor this so that callbacks can be removed from
    // tools.
    return (
      outcome === ToolConfirmationOutcome.ProceedAlways &&
      (AUTO_EDIT_TOOLS as readonly string[]).includes(tool.name)
    );
  }

  /**
   * Handles policy updates for standard tools (Shell, Info, etc.), including
   * session-level and persistent approvals.
   */
  private async _handleStandardPolicyUpdate(
    tool: AnyDeclarativeTool,
    outcome: ToolConfirmationOutcome,
    confirmationDetails?: SerializableConfirmationDetails,
  ): Promise<void> {
    if (
      outcome === ToolConfirmationOutcome.ProceedAlways ||
      outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
    ) {
      const options: PolicyUpdateOptions = {};

      if (confirmationDetails?.type === 'exec') {
        options.commandPrefix = confirmationDetails.rootCommands;
      }

      await this.messageBus.publish({
        type: MessageBusType.UPDATE_POLICY,
        toolName: tool.name,
        persist: outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave,
        ...options,
      });
    }
  }

  /**
   * Handles policy updates specifically for MCP tools, including session-level
   * and persistent approvals.
   */
  private async _handleMcpPolicyUpdate(
    tool: AnyDeclarativeTool,
    outcome: ToolConfirmationOutcome,
    confirmationDetails: Extract<
      SerializableConfirmationDetails,
      { type: 'mcp' }
    >,
  ): Promise<void> {
    const isMcpAlways =
      outcome === ToolConfirmationOutcome.ProceedAlways ||
      outcome === ToolConfirmationOutcome.ProceedAlwaysTool ||
      outcome === ToolConfirmationOutcome.ProceedAlwaysServer ||
      outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave;

    if (!isMcpAlways) {
      return;
    }

    let toolName = tool.name;
    const persist = outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave;

    // If "Always allow all tools from this server", use the wildcard pattern
    if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
      toolName = `${confirmationDetails.serverName}__*`;
    }

    await this.messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      mcpName: confirmationDetails.serverName,
      persist,
    });
  }
  /**
   * Executes the tool and records the result.
   */
  private async _execute(callId: string, signal: AbortSignal): Promise<void> {
    this.state.updateStatus(callId, 'scheduled');
    if (signal.aborted) throw new Error('Operation cancelled');
    this.state.updateStatus(callId, 'executing');

    const result = await this.executor.execute({
      call: this.state.getFirstActiveCall() as ExecutingToolCall,
      signal,
      outputUpdateHandler: (id, out) =>
        this.state.updateStatus(id, 'executing', { liveOutput: out }),
      onUpdateToolCall: (updated) => {
        if (updated.status === 'executing' && updated.pid) {
          this.state.updateStatus(callId, 'executing', { pid: updated.pid });
        }
      },
    });

    if (result.status === 'success') {
      this.state.updateStatus(callId, 'success', result.response);
    } else if (result.status === 'cancelled') {
      this.state.updateStatus(callId, 'cancelled', 'Operation cancelled');
    } else {
      this.state.updateStatus(callId, 'error', result.response);
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

  /**
   * Waits for user confirmation, allowing either the MessageBus (TUI) or IDE to
   * resolve it.
   */
  private async _waitForConfirmation(
    correlationId: string,
    signal: AbortSignal,
    ideConfirmation?: Promise<DiffUpdateResult>,
  ): Promise<{
    outcome: ToolConfirmationOutcome;
    payload?: ToolConfirmationPayload;
  }> {
    if (ideConfirmation) {
      // Pipe IDE resolution to MessageBus. This ensures that the coordinator
      // correctly cleans up its listener when the IDE responds first.
      void (async () => {
        try {
          const resolution = await ideConfirmation;
          if (signal.aborted) return;

          await this.messageBus.publish({
            type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
            correlationId,
            confirmed: resolution.status === 'accepted',
            outcome:
              resolution.status === 'accepted'
                ? ToolConfirmationOutcome.ProceedOnce
                : ToolConfirmationOutcome.Cancel,
            payload: resolution.content
              ? { newContent: resolution.content }
              : undefined,
          });
        } catch (error) {
          debugLogger.warn('Error waiting for confirmation via IDE', error);
        }
      })();
    }

    return this.coordinator.awaitConfirmation(correlationId, signal);
  }
}
