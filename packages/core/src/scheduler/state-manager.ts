/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCall,
  Status,
  WaitingToolCall,
  CompletedToolCall,
  SuccessfulToolCall,
  ErroredToolCall,
  CancelledToolCall,
  ScheduledToolCall,
  ValidatingToolCall,
  ExecutingToolCall,
  ToolCallResponseInfo,
} from './types.js';
import type {
  ToolConfirmationOutcome,
  ToolResultDisplay,
  AnyToolInvocation,
  ToolCallConfirmationDetails,
  AnyDeclarativeTool,
} from '../tools/tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type SerializableConfirmationDetails,
} from '../confirmation-bus/types.js';

/**
 * Manages the state of tool calls.
 * Publishes state changes to the MessageBus via TOOL_CALLS_UPDATE events.
 */
export class SchedulerStateManager {
  private readonly activeCalls = new Map<string, ToolCall>();
  private readonly queue: ToolCall[] = [];
  private _completedBatch: CompletedToolCall[] = [];

  constructor(private readonly messageBus: MessageBus) {}

  addToolCalls(calls: ToolCall[]): void {
    this.enqueue(calls);
  }

  getToolCall(callId: string): ToolCall | undefined {
    return (
      this.activeCalls.get(callId) ||
      this.queue.find((c) => c.request.callId === callId) ||
      this._completedBatch.find((c) => c.request.callId === callId)
    );
  }

  enqueue(calls: ToolCall[]): void {
    this.queue.push(...calls);
    this.emitUpdate();
  }

  dequeue(): ToolCall | undefined {
    const next = this.queue.shift();
    if (next) {
      this.activeCalls.set(next.request.callId, next);
      this.emitUpdate();
    }
    return next;
  }

  get isActive(): boolean {
    return this.activeCalls.size > 0;
  }

  get activeCallCount(): number {
    return this.activeCalls.size;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get firstActiveCall(): ToolCall | undefined {
    return this.activeCalls.values().next().value;
  }

  /**
   * Updates the status of a tool call with specific auxiliary data required for certain states.
   */
  updateStatus(
    callId: string,
    status: 'success',
    data: ToolCallResponseInfo,
  ): void;
  updateStatus(
    callId: string,
    status: 'error',
    data: ToolCallResponseInfo,
  ): void;
  updateStatus(
    callId: string,
    status: 'awaiting_approval',
    data:
      | ToolCallConfirmationDetails
      | {
          correlationId: string;
          confirmationDetails: SerializableConfirmationDetails;
        },
  ): void;
  updateStatus(callId: string, status: 'cancelled', data: string): void;
  updateStatus(
    callId: string,
    status: 'executing',
    data?: Partial<ExecutingToolCall>,
  ): void;
  updateStatus(callId: string, status: 'scheduled' | 'validating'): void;
  updateStatus(callId: string, status: Status, auxiliaryData?: unknown): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const updatedCall = this.transitionCall(call, status, auxiliaryData);
    this.activeCalls.set(callId, updatedCall);

    this.emitUpdate();
  }

  finalizeCall(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    if (this.isTerminalCall(call)) {
      this._completedBatch.push(call);
      this.activeCalls.delete(callId);
    }
  }

  updateArgs(
    callId: string,
    newArgs: Record<string, unknown>,
    newInvocation: AnyToolInvocation,
  ): void {
    const call = this.activeCalls.get(callId);
    if (!call || call.status === 'error') return;

    this.activeCalls.set(
      callId,
      this.patchCall(call, {
        request: { ...call.request, args: newArgs },
        invocation: newInvocation,
      }),
    );
    this.emitUpdate();
  }

  setOutcome(callId: string, outcome: ToolConfirmationOutcome): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    this.activeCalls.set(callId, this.patchCall(call, { outcome }));
    this.emitUpdate();
  }

  cancelAllQueued(reason: string): void {
    while (this.queue.length > 0) {
      const queuedCall = this.queue.shift()!;
      if (queuedCall.status === 'error') {
        this._completedBatch.push(queuedCall);
        continue;
      }
      this._completedBatch.push(this.toCancelled(queuedCall, reason));
    }
    this.emitUpdate();
  }

  getSnapshot(): ToolCall[] {
    return [
      ...this._completedBatch,
      ...Array.from(this.activeCalls.values()),
      ...this.queue,
    ];
  }

  clearBatch(): void {
    if (this._completedBatch.length === 0) return;
    this._completedBatch = [];
    this.emitUpdate();
  }

  get completedBatch(): CompletedToolCall[] {
    return [...this._completedBatch];
  }

  private emitUpdate() {
    const snapshot = this.getSnapshot();

    // Fire and forget - The message bus handles the publish and error handling.
    void this.messageBus.publish({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: snapshot,
    });
  }

  private isTerminalCall(call: ToolCall): call is CompletedToolCall {
    const { status } = call;
    return status === 'success' || status === 'error' || status === 'cancelled';
  }

  private transitionCall(
    call: ToolCall,
    newStatus: Status,
    auxiliaryData?: unknown,
  ): ToolCall {
    switch (newStatus) {
      case 'success': {
        if (!this.isToolCallResponseInfo(auxiliaryData)) {
          throw new Error(
            `Invalid data for 'success' transition (callId: ${call.request.callId})`,
          );
        }
        return this.toSuccess(call, auxiliaryData);
      }
      case 'error': {
        if (!this.isToolCallResponseInfo(auxiliaryData)) {
          throw new Error(
            `Invalid data for 'error' transition (callId: ${call.request.callId})`,
          );
        }
        return this.toError(call, auxiliaryData);
      }
      case 'awaiting_approval': {
        if (!auxiliaryData) {
          throw new Error(
            `Missing data for 'awaiting_approval' transition (callId: ${call.request.callId})`,
          );
        }
        return this.toAwaitingApproval(call, auxiliaryData);
      }
      case 'scheduled':
        return this.toScheduled(call);
      case 'cancelled': {
        if (typeof auxiliaryData !== 'string') {
          throw new Error(
            `Invalid reason (string) for 'cancelled' transition (callId: ${call.request.callId})`,
          );
        }
        return this.toCancelled(call, auxiliaryData);
      }
      case 'validating':
        return this.toValidating(call);
      case 'executing': {
        if (
          auxiliaryData !== undefined &&
          !this.isExecutingToolCallPatch(auxiliaryData)
        ) {
          throw new Error(
            `Invalid patch for 'executing' transition (callId: ${call.request.callId})`,
          );
        }
        return this.toExecuting(call, auxiliaryData);
      }
      default: {
        const exhaustiveCheck: never = newStatus;
        return exhaustiveCheck;
      }
    }
  }

  private isToolCallResponseInfo(data: unknown): data is ToolCallResponseInfo {
    return (
      typeof data === 'object' &&
      data !== null &&
      'callId' in data &&
      'responseParts' in data
    );
  }

  private isExecutingToolCallPatch(
    data: unknown,
  ): data is Partial<ExecutingToolCall> {
    // A partial can be an empty object, but it must be a non-null object.
    return typeof data === 'object' && data !== null;
  }

  // --- Transition Helpers ---

  /**
   * Ensures the tool call has an associated tool and invocation before
   * transitioning to states that require them.
   */
  private validateHasToolAndInvocation(
    call: ToolCall,
    targetStatus: Status,
  ): asserts call is ToolCall & {
    tool: AnyDeclarativeTool;
    invocation: AnyToolInvocation;
  } {
    if (
      !('tool' in call && call.tool && 'invocation' in call && call.invocation)
    ) {
      throw new Error(
        `Invalid state transition: cannot transition to ${targetStatus} without tool/invocation (callId: ${call.request.callId})`,
      );
    }
  }

  private toSuccess(
    call: ToolCall,
    response: ToolCallResponseInfo,
  ): SuccessfulToolCall {
    this.validateHasToolAndInvocation(call, 'success');
    const startTime = 'startTime' in call ? call.startTime : undefined;
    return {
      request: call.request,
      tool: call.tool,
      invocation: call.invocation,
      status: 'success',
      response,
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    };
  }

  private toError(
    call: ToolCall,
    response: ToolCallResponseInfo,
  ): ErroredToolCall {
    const startTime = 'startTime' in call ? call.startTime : undefined;
    return {
      request: call.request,
      status: 'error',
      tool: 'tool' in call ? call.tool : undefined,
      response,
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    };
  }

  private toAwaitingApproval(call: ToolCall, data: unknown): WaitingToolCall {
    this.validateHasToolAndInvocation(call, 'awaiting_approval');

    let confirmationDetails:
      | ToolCallConfirmationDetails
      | SerializableConfirmationDetails;
    let correlationId: string | undefined;

    if (this.isEventDrivenApprovalData(data)) {
      correlationId = data.correlationId;
      confirmationDetails = data.confirmationDetails;
    } else {
      // TODO: Remove legacy callback shape once event-driven migration is complete
      confirmationDetails = data as ToolCallConfirmationDetails;
    }

    return {
      request: call.request,
      tool: call.tool,
      status: 'awaiting_approval',
      correlationId,
      confirmationDetails,
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: call.invocation,
    };
  }

  private isEventDrivenApprovalData(data: unknown): data is {
    correlationId: string;
    confirmationDetails: SerializableConfirmationDetails;
  } {
    return (
      typeof data === 'object' &&
      data !== null &&
      'correlationId' in data &&
      'confirmationDetails' in data
    );
  }

  private toScheduled(call: ToolCall): ScheduledToolCall {
    this.validateHasToolAndInvocation(call, 'scheduled');
    return {
      request: call.request,
      tool: call.tool,
      status: 'scheduled',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: call.invocation,
    };
  }

  private toCancelled(call: ToolCall, reason: string): CancelledToolCall {
    this.validateHasToolAndInvocation(call, 'cancelled');
    const startTime = 'startTime' in call ? call.startTime : undefined;

    // TODO: Refactor this tool-specific logic into the confirmation details payload.
    // See: https://github.com/google-gemini/gemini-cli/issues/16716
    let resultDisplay: ToolResultDisplay | undefined = undefined;
    if (this.isWaitingToolCall(call)) {
      const details = call.confirmationDetails;
      if (
        details.type === 'edit' &&
        'fileDiff' in details &&
        'fileName' in details &&
        'filePath' in details &&
        'originalContent' in details &&
        'newContent' in details
      ) {
        resultDisplay = {
          fileDiff: details.fileDiff,
          fileName: details.fileName,
          filePath: details.filePath,
          originalContent: details.originalContent,
          newContent: details.newContent,
        };
      }
    }

    const errorMessage = `[Operation Cancelled] Reason: ${reason}`;
    return {
      request: call.request,
      tool: call.tool,
      invocation: call.invocation,
      status: 'cancelled',
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
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    };
  }

  private isWaitingToolCall(call: ToolCall): call is WaitingToolCall {
    return call.status === 'awaiting_approval';
  }

  private patchCall<T extends ToolCall>(call: T, patch: Partial<T>): T {
    return { ...call, ...patch };
  }

  private toValidating(call: ToolCall): ValidatingToolCall {
    this.validateHasToolAndInvocation(call, 'validating');
    return {
      request: call.request,
      tool: call.tool,
      status: 'validating',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: call.invocation,
    };
  }

  private toExecuting(call: ToolCall, data?: unknown): ExecutingToolCall {
    this.validateHasToolAndInvocation(call, 'executing');
    const execData = data as Partial<ExecutingToolCall> | undefined;
    const liveOutput =
      execData?.liveOutput ??
      ('liveOutput' in call ? call.liveOutput : undefined);
    const pid = execData?.pid ?? ('pid' in call ? call.pid : undefined);

    return {
      request: call.request,
      tool: call.tool,
      status: 'executing',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: call.invocation,
      liveOutput,
      pid,
    };
  }
}
