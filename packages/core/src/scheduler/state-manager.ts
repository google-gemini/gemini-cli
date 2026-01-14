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
  private activeCalls = new Map<string, ToolCall>();
  private queue: ToolCall[] = [];
  private completedBatch: CompletedToolCall[] = [];

  constructor(private messageBus: MessageBus) {}

  addToolCalls(calls: ToolCall[]): void {
    this.enqueue(calls);
  }

  getToolCall(callId: string): ToolCall | undefined {
    return (
      this.activeCalls.get(callId) ||
      this.queue.find((c) => c.request.callId === callId) ||
      this.completedBatch.find((c) => c.request.callId === callId)
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

  hasActiveCalls(): boolean {
    return this.activeCalls.size > 0;
  }

  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

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

  finalizeCall(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

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
      if (queuedCall.status === 'error') {
        this.completedBatch.push(queuedCall);
        continue;
      }
      this.completedBatch.push(this.toCancelled(queuedCall, reason));
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
    return [...this.completedBatch];
  }

  private emitUpdate() {
    const snapshot = this.getSnapshot();

    // Fire and forget - The message bus handles the publish and error handling.
    void this.messageBus.publish({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: snapshot,
    });
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
        return this.toAwaitingApproval(call, auxiliaryData);
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

    // Handle both Legacy and New data shapes safely
    let confirmationDetails:
      | ToolCallConfirmationDetails
      | SerializableConfirmationDetails;
    let correlationId: string | undefined;

    if (data && typeof data === 'object' && 'correlationId' in data) {
      // New Event-Driven Shape
      const typedData = data as {
        correlationId: string;
        confirmationDetails: SerializableConfirmationDetails;
      };
      correlationId = typedData.correlationId;
      confirmationDetails = typedData.confirmationDetails;
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

    // Preserve diff for cancelled edit operations
    let resultDisplay: ToolResultDisplay | undefined = undefined;
    if (call.status === 'awaiting_approval') {
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
