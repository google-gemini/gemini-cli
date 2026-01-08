/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ToolCall,
  type Status,
  type WaitingToolCall,
  type ToolCallsUpdateHandler,
  type CompletedToolCall,
  type SuccessfulToolCall,
  type ErroredToolCall,
  type CancelledToolCall,
  type ScheduledToolCall,
  type ValidatingToolCall,
  type ExecutingToolCall,
  type ToolCallResponseInfo,
} from './types.js';
import {
  type ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  type ToolResultDisplay,
  type AnyToolInvocation,
} from '../tools/tools.js';

/**
 * Manages the state of tool calls for the CoreToolScheduler.
 * This class encapsulates the data structures and state transitions.
 */
export class SchedulerStateManager {
  private activeCalls = new Map<string, ToolCall>();
  private queue: ToolCall[] = [];
  private completedBatch: CompletedToolCall[] = [];

  constructor(private onUpdate?: ToolCallsUpdateHandler) {}

  enqueue(calls: ToolCall[]): void {
    this.queue.push(...calls);
    this.emitUpdate();
  }

  dequeue(): ToolCall | undefined {
    const next = this.queue.shift();
    if (next) {
      this.activeCalls.set(next.request.callId, next);
    }
    return next;
  }

  hasActiveCalls(): boolean {
    return this.activeCalls.size > 0;
  }

  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Returns the first active call, if any.
   * Useful for the current single-active-tool implementation.
   */
  getFirstActiveCall(): ToolCall | undefined {
    return this.activeCalls.values().next().value;
  }

  updateStatus(callId: string, status: Status, auxiliaryData?: unknown): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const updatedCall = this.transitionCall(call, status, auxiliaryData);

    this.activeCalls.set(callId, updatedCall);

    this.emitUpdate();
  }

  /**
   * Moves an active tool call to the completed batch.
   * This should be called by the scheduler after it has finished processing
   * the terminal state (e.g., logging, etc).
   */
  finalizeCall(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (!call) {
      return;
    }

    if (this.isTerminal(call.status)) {
      this.completedBatch.push(call as CompletedToolCall);
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

    this.activeCalls.set(callId, {
      ...call,
      request: { ...call.request, args: newArgs },
      invocation: newInvocation,
    } as ToolCall);
    this.emitUpdate();
  }

  setOutcome(callId: string, outcome: ToolConfirmationOutcome): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    this.activeCalls.set(callId, {
      ...call,
      outcome,
    } as ToolCall);
    this.emitUpdate();
  }

  cancelAllQueued(reason: string): void {
    while (this.queue.length > 0) {
      const queuedCall = this.queue.shift()!;

      // Don't cancel tools that already errored during validation.
      if (queuedCall.status === 'error') {
        this.completedBatch.push(queuedCall);
        continue;
      }

      const durationMs =
        'startTime' in queuedCall && queuedCall.startTime
          ? Date.now() - queuedCall.startTime
          : undefined;

      const errorMessage = `[Operation Cancelled] ${reason}`;

      this.completedBatch.push({
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
      } as CancelledToolCall);
    }
    this.emitUpdate();
  }

  getSnapshot(): ToolCall[] {
    return [
      ...this.completedBatch,
      ...Array.from(this.activeCalls.values()),
      ...this.queue,
    ];
  }

  clearBatch(): void {
    if (this.completedBatch.length === 0) return;
    this.completedBatch = [];
    this.emitUpdate();
  }

  getCompletedBatch(): CompletedToolCall[] {
    return this.completedBatch;
  }

  private emitUpdate() {
    if (this.onUpdate) {
      this.onUpdate(this.getSnapshot());
    }
  }

  private isTerminal(status: Status): boolean {
    return status === 'success' || status === 'error' || status === 'cancelled';
  }

  private transitionCall(
    call: ToolCall,
    newStatus: Status,
    auxiliaryData?: unknown,
  ): ToolCall {
    switch (newStatus) {
      case 'success':
        return this.toSuccess(call, auxiliaryData as ToolCallResponseInfo);
      case 'error':
        return this.toError(call, auxiliaryData as ToolCallResponseInfo);
      case 'awaiting_approval':
        return this.toAwaitingApproval(
          call,
          auxiliaryData as ToolCallConfirmationDetails,
        );
      case 'scheduled':
        return this.toScheduled(call);
      case 'cancelled':
        return this.toCancelled(call, auxiliaryData as string);
      case 'validating':
        return this.toValidating(call);
      case 'executing':
        return this.toExecuting(call, auxiliaryData);
      default: {
        const exhaustiveCheck: never = newStatus;
        return exhaustiveCheck;
      }
    }
  }

  private toSuccess(
    call: ToolCall,
    response: ToolCallResponseInfo,
  ): SuccessfulToolCall {
    const startTime = 'startTime' in call ? call.startTime : undefined;
    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      invocation: 'invocation' in call ? call.invocation : undefined,
      status: 'success',
      response,
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    } as SuccessfulToolCall;
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
    } as ErroredToolCall;
  }

  private toAwaitingApproval(
    call: ToolCall,
    confirmationDetails: ToolCallConfirmationDetails,
  ): WaitingToolCall {
    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      status: 'awaiting_approval',
      confirmationDetails,
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: 'invocation' in call ? call.invocation : undefined,
    } as WaitingToolCall;
  }

  private toScheduled(call: ToolCall): ScheduledToolCall {
    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      status: 'scheduled',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: 'invocation' in call ? call.invocation : undefined,
    } as ScheduledToolCall;
  }

  private toCancelled(call: ToolCall, reason: string): CancelledToolCall {
    const startTime = 'startTime' in call ? call.startTime : undefined;

    // Preserve diff for cancelled edit operations
    let resultDisplay: ToolResultDisplay | undefined = undefined;
    if (call.status === 'awaiting_approval') {
      const waitingCall = call;
      if (waitingCall.confirmationDetails.type === 'edit') {
        resultDisplay = {
          fileDiff: waitingCall.confirmationDetails.fileDiff,
          fileName: waitingCall.confirmationDetails.fileName,
          filePath: waitingCall.confirmationDetails.filePath,
          originalContent: waitingCall.confirmationDetails.originalContent,
          newContent: waitingCall.confirmationDetails.newContent,
        };
      }
    }

    const errorMessage = `[Operation Cancelled] Reason: ${reason}`;
    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      invocation: 'invocation' in call ? call.invocation : undefined,
      status: 'cancelled',
      response: {
        callId: call.request.callId,
        responseParts: [
          {
            functionResponse: {
              id: call.request.callId,
              name: call.request.name,
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
      durationMs: startTime ? Date.now() - startTime : undefined,
      outcome: call.outcome,
    } as CancelledToolCall;
  }

  private toValidating(call: ToolCall): ValidatingToolCall {
    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      status: 'validating',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: 'invocation' in call ? call.invocation : undefined,
    } as ValidatingToolCall;
  }

  private toExecuting(call: ToolCall, data?: unknown): ExecutingToolCall {
    const execData = data as Partial<ExecutingToolCall> | undefined;
    const liveOutput =
      execData?.liveOutput ??
      ('liveOutput' in call ? call.liveOutput : undefined);
    const pid = execData?.pid ?? ('pid' in call ? call.pid : undefined);

    return {
      request: call.request,
      tool: 'tool' in call ? call.tool : undefined,
      status: 'executing',
      startTime: 'startTime' in call ? call.startTime : undefined,
      outcome: call.outcome,
      invocation: 'invocation' in call ? call.invocation : undefined,
      liveOutput,
      pid,
    } as ExecutingToolCall;
  }
}
