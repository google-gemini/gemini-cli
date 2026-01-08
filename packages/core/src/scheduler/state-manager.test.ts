/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerStateManager } from './state-manager.js';
import {
  type ValidatingToolCall,
  type WaitingToolCall,
  type SuccessfulToolCall,
  type ErroredToolCall,
  type CancelledToolCall,
  type ExecutingToolCall,
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
  type ToolCallsUpdateHandler,
} from './types.js';
import {
  ToolConfirmationOutcome,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../tools/tools.js';

describe('SchedulerStateManager', () => {
  const mockRequest: ToolCallRequestInfo = {
    callId: 'call-1',
    name: 'test-tool',
    args: { foo: 'bar' },
    isClientInitiated: false,
    prompt_id: 'prompt-1',
  };

  const mockTool = {
    name: 'test-tool',
    displayName: 'Test Tool',
  } as AnyDeclarativeTool;

  const mockInvocation = {
    shouldConfirmExecute: vi.fn(),
  } as unknown as AnyToolInvocation;

  const createValidatingCall = (id = 'call-1'): ValidatingToolCall => ({
    status: 'validating',
    request: { ...mockRequest, callId: id },
    tool: mockTool,
    invocation: mockInvocation,
    startTime: Date.now(),
  });

  let stateManager: SchedulerStateManager;
  let onUpdate: ToolCallsUpdateHandler;

  beforeEach(() => {
    onUpdate = vi.fn() as unknown as ToolCallsUpdateHandler;
    stateManager = new SchedulerStateManager(onUpdate);
  });

  describe('Initialization', () => {
    it('should start with empty state', () => {
      expect(stateManager.hasActiveCalls()).toBe(false);
      expect(stateManager.getActiveCallCount()).toBe(0);
      expect(stateManager.getQueueLength()).toBe(0);
      expect(stateManager.getSnapshot()).toEqual([]);
    });
  });

  describe('Queue Management', () => {
    it('should enqueue calls and notify', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);

      expect(stateManager.getQueueLength()).toBe(1);
      expect(onUpdate).toHaveBeenCalledWith([call]);
    });

    it('should dequeue calls and notify', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);

      const dequeued = stateManager.dequeue();

      expect(dequeued).toEqual(call);
      expect(stateManager.getQueueLength()).toBe(0);
      expect(stateManager.getActiveCallCount()).toBe(1);
      expect(onUpdate).toHaveBeenCalled();
    });

    it('should return undefined when dequeueing from empty queue', () => {
      const dequeued = stateManager.dequeue();
      expect(dequeued).toBeUndefined();
    });
  });

  describe('Status Transitions', () => {
    it('should transition validating to scheduled', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      stateManager.updateStatus(call.request.callId, 'scheduled');

      const snapshot = stateManager.getSnapshot();
      expect(snapshot[0].status).toBe('scheduled');
      expect(snapshot[0].request.callId).toBe(call.request.callId);
    });

    it('should transition scheduled to executing', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();
      stateManager.updateStatus(call.request.callId, 'scheduled');

      stateManager.updateStatus(call.request.callId, 'executing');

      expect(stateManager.getFirstActiveCall()?.status).toBe('executing');
    });

    it('should transition to success and move to completed batch', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      const response: ToolCallResponseInfo = {
        callId: call.request.callId,
        responseParts: [],
        resultDisplay: 'Success',
        error: undefined,
        errorType: undefined,
      };

      stateManager.updateStatus(call.request.callId, 'success', response);
      stateManager.finalizeCall(call.request.callId);

      expect(stateManager.hasActiveCalls()).toBe(false);
      expect(stateManager.getCompletedBatch()).toHaveLength(1);
      const completed =
        stateManager.getCompletedBatch()[0] as SuccessfulToolCall;
      expect(completed.status).toBe('success');
      expect(completed.response).toEqual(response);
      expect(completed.durationMs).toBeDefined();
    });

    it('should transition to error and move to completed batch', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      const response: ToolCallResponseInfo = {
        callId: call.request.callId,
        responseParts: [],
        resultDisplay: 'Error',
        error: new Error('Failed'),
        errorType: undefined,
      };

      stateManager.updateStatus(call.request.callId, 'error', response);
      stateManager.finalizeCall(call.request.callId);

      expect(stateManager.hasActiveCalls()).toBe(false);
      expect(stateManager.getCompletedBatch()).toHaveLength(1);
      const completed = stateManager.getCompletedBatch()[0] as ErroredToolCall;
      expect(completed.status).toBe('error');
      expect(completed.response).toEqual(response);
    });

    it('should transition to awaiting_approval with details', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      const details = { type: 'info', title: 'Confirm', prompt: 'Proceed?' };

      stateManager.updateStatus(
        call.request.callId,
        'awaiting_approval',
        details,
      );

      const active = stateManager.getFirstActiveCall() as WaitingToolCall;
      expect(active.status).toBe('awaiting_approval');
      expect(active.confirmationDetails).toEqual(details);
    });

    it('should preserve diff when cancelling an edit tool call', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      const details = {
        type: 'edit',
        title: 'Edit',
        fileName: 'test.txt',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
      };

      stateManager.updateStatus(
        call.request.callId,
        'awaiting_approval',
        details,
      );
      stateManager.updateStatus(
        call.request.callId,
        'cancelled',
        'User said no',
      );
      stateManager.finalizeCall(call.request.callId);

      const completed =
        stateManager.getCompletedBatch()[0] as CancelledToolCall;
      expect(completed.status).toBe('cancelled');
      expect(completed.response.resultDisplay).toEqual({
        fileDiff: 'diff',
        fileName: 'test.txt',
        originalContent: 'old',
        newContent: 'new',
      });
    });

    it('should ignore status updates for non-existent callIds', () => {
      stateManager.updateStatus('unknown', 'scheduled');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should ignore status updates for terminal calls', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();
      stateManager.updateStatus(call.request.callId, 'success', {});
      stateManager.finalizeCall(call.request.callId);

      vi.mocked(onUpdate).mockClear();
      stateManager.updateStatus(call.request.callId, 'scheduled');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should only finalize terminal calls', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      stateManager.updateStatus(call.request.callId, 'executing');
      stateManager.finalizeCall(call.request.callId);

      expect(stateManager.hasActiveCalls()).toBe(true);
      expect(stateManager.getCompletedBatch()).toHaveLength(0);

      stateManager.updateStatus(call.request.callId, 'success', {});
      stateManager.finalizeCall(call.request.callId);

      expect(stateManager.hasActiveCalls()).toBe(false);
      expect(stateManager.getCompletedBatch()).toHaveLength(1);
    });

    it('should merge liveOutput and pid during executing updates', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      // Start executing
      stateManager.updateStatus(call.request.callId, 'executing');
      let active = stateManager.getFirstActiveCall() as ExecutingToolCall;
      expect(active.status).toBe('executing');
      expect(active.liveOutput).toBeUndefined();

      // Update with live output
      stateManager.updateStatus(call.request.callId, 'executing', {
        liveOutput: 'chunk 1',
      });
      active = stateManager.getFirstActiveCall() as ExecutingToolCall;
      expect(active.liveOutput).toBe('chunk 1');

      // Update with pid (should preserve liveOutput)
      stateManager.updateStatus(call.request.callId, 'executing', {
        pid: 1234,
      });
      active = stateManager.getFirstActiveCall() as ExecutingToolCall;
      expect(active.liveOutput).toBe('chunk 1');
      expect(active.pid).toBe(1234);

      // Update live output again (should preserve pid)
      stateManager.updateStatus(call.request.callId, 'executing', {
        liveOutput: 'chunk 2',
      });
      active = stateManager.getFirstActiveCall() as ExecutingToolCall;
      expect(active.liveOutput).toBe('chunk 2');
      expect(active.pid).toBe(1234);
    });
  });

  describe('Argument Updates', () => {
    it('should update args and invocation', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      const newArgs = { foo: 'updated' };
      const newInvocation = { ...mockInvocation } as AnyToolInvocation;

      stateManager.updateArgs(call.request.callId, newArgs, newInvocation);

      const active = stateManager.getFirstActiveCall();
      if (active && 'invocation' in active) {
        expect(active.invocation).toEqual(newInvocation);
      } else {
        throw new Error('Active call should have invocation');
      }
    });

    it('should ignore arg updates for errored calls', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();
      stateManager.updateStatus(call.request.callId, 'error', {});
      stateManager.finalizeCall(call.request.callId);

      stateManager.updateArgs(
        call.request.callId,
        { foo: 'new' },
        mockInvocation,
      );

      const completed = stateManager.getCompletedBatch()[0];
      expect(completed.request.args).toEqual(mockRequest.args);
    });
  });

  describe('Outcome Tracking', () => {
    it('should set outcome and notify', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();

      stateManager.setOutcome(
        call.request.callId,
        ToolConfirmationOutcome.ProceedAlways,
      );

      const active = stateManager.getFirstActiveCall();
      expect(active?.outcome).toBe(ToolConfirmationOutcome.ProceedAlways);
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should cancel all queued calls', () => {
      stateManager.enqueue([
        createValidatingCall('1'),
        createValidatingCall('2'),
      ]);

      stateManager.cancelAllQueued('Batch cancel');

      expect(stateManager.getQueueLength()).toBe(0);
      expect(stateManager.getCompletedBatch()).toHaveLength(2);
      expect(
        stateManager.getCompletedBatch().every((c) => c.status === 'cancelled'),
      ).toBe(true);
    });

    it('should clear batch and notify', () => {
      const call = createValidatingCall();
      stateManager.enqueue([call]);
      stateManager.dequeue();
      stateManager.updateStatus(call.request.callId, 'success', {});
      stateManager.finalizeCall(call.request.callId);

      stateManager.clearBatch();

      expect(stateManager.getCompletedBatch()).toHaveLength(0);
      expect(onUpdate).toHaveBeenCalledWith([]);
    });
  });

  describe('Snapshot and Ordering', () => {
    it('should return snapshot in order: completed, active, queue', () => {
      // 1. Completed
      const call1 = createValidatingCall('1');
      stateManager.enqueue([call1]);
      stateManager.dequeue();
      stateManager.updateStatus('1', 'success', {});
      stateManager.finalizeCall('1');

      // 2. Active
      const call2 = createValidatingCall('2');
      stateManager.enqueue([call2]);
      stateManager.dequeue();

      // 3. Queue
      const call3 = createValidatingCall('3');
      stateManager.enqueue([call3]);

      const snapshot = stateManager.getSnapshot();
      expect(snapshot).toHaveLength(3);
      expect(snapshot[0].request.callId).toBe('1');
      expect(snapshot[1].request.callId).toBe('2');
      expect(snapshot[2].request.callId).toBe('3');
    });
  });
});
