/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  type Config,
  MessageBusType,
  ToolConfirmationOutcome,
  ApprovalMode,
  Scheduler,
  type MessageBus,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';

describe('Task Event-Driven Scheduler', () => {
  let mockConfig: Config;
  let mockEventBus: ExecutionEventBus;
  let messageBus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig({
      isEventDrivenSchedulerEnabled: () => true,
    }) as Config;
    messageBus = mockConfig.getMessageBus();
    mockEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };
  });

  it('should instantiate Scheduler when enabled', () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);
    expect(task.scheduler).toBeInstanceOf(Scheduler);
  });

  it('should subscribe to TOOL_CALLS_UPDATE and map status changes', async () => {
    // @ts-expect-error - Calling private constructor
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'executing',
    };

    // Simulate MessageBus event
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
    });

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({
          state: 'submitted', // initial task state
        }),
        metadata: expect.objectContaining({
          coderAgent: expect.objectContaining({
            kind: 'tool-call-update',
          }),
        }),
      }),
    );
  });

  it('should handle tool confirmations by publishing to MessageBus', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    // Simulate MessageBus event to stash the correlationId
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
    });

    // Simulate A2A client confirmation
    const part = {
      kind: 'data',
      data: {
        callId: '1',
        outcome: 'proceed_once',
      },
    };

    const handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart(part);
    expect(handled).toBe(true);

    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      }),
    );
  });

  it('should handle Rejection (Cancel) and Modification (ModifyWithEditor)', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({ type: MessageBusType.TOOL_CALLS_UPDATE, toolCalls: [toolCall] });

    // Simulate Rejection (Cancel)
    let handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '1', outcome: 'cancel' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: false,
      }),
    );

    const toolCall2 = {
      request: { callId: '2', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-2',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };
    handler({ type: MessageBusType.TOOL_CALLS_UPDATE, toolCalls: [toolCall2] });

    // Simulate ModifyWithEditor
    handled = await (
      task as unknown as {
        _handleToolConfirmationPart: (part: unknown) => Promise<boolean>;
      }
    )._handleToolConfirmationPart({
      kind: 'data',
      data: { callId: '2', outcome: 'modify_with_editor' },
    });
    expect(handled).toBe(true);
    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-2',
        confirmed: false,
        outcome: ToolConfirmationOutcome.ModifyWithEditor,
        payload: undefined,
      }),
    );
  });

  it('should execute without confirmation in YOLO mode', async () => {
    // Enable YOLO mode
    const yoloConfig = createMockConfig({
      isEventDrivenSchedulerEnabled: () => true,
      getApprovalMode: () => ApprovalMode.YOLO,
    }) as Config;
    const yoloMessageBus = yoloConfig.getMessageBus();

    // @ts-expect-error - Calling private constructor
    const _task = new Task('task-id', 'context-id', yoloConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'awaiting_approval',
      correlationId: 'corr-1',
      confirmationDetails: { type: 'info', title: 'test', prompt: 'test' },
    };

    const handler = (yoloMessageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({ type: MessageBusType.TOOL_CALLS_UPDATE, toolCalls: [toolCall] });

    // Should immediately auto-publish ProceedOnce without user intervention
    expect(yoloMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'corr-1',
        confirmed: true,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      }),
    );
  });

  it('should handle output updates via the message bus', async () => {
    // @ts-expect-error - Calling private constructor
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCall = {
      request: { callId: '1', name: 'ls', args: {} },
      status: 'executing',
      liveOutput: 'chunk1',
    };

    // Simulate MessageBus event
    // Simulate MessageBus event
    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    if (!handler) {
      throw new Error('TOOL_CALLS_UPDATE handler not found');
    }

    handler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      toolCalls: [toolCall],
    });

    // Should publish artifact update for output
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'artifact-update',
        artifact: expect.objectContaining({
          artifactId: 'tool-1-output',
          parts: [{ kind: 'text', text: 'chunk1' }],
        }),
      }),
    );
  });

  it('should complete artifact creation without hanging', async () => {
    // @ts-expect-error - Calling private constructor
    const task = new Task('task-id', 'context-id', mockConfig, mockEventBus);

    const toolCallId = 'create-file-123';
    task['_registerToolCall'](toolCallId, 'executing');

    const toolCall = {
      request: {
        callId: toolCallId,
        name: 'writeFile',
        args: { path: 'test.sh' },
      },
      status: 'success',
      result: { ok: true },
    };

    const handler = (messageBus.subscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];
    handler({ type: MessageBusType.TOOL_CALLS_UPDATE, toolCalls: [toolCall] });

    // The tool should be complete and registered appropriately, eventually
    // triggering the toolCompletionPromise resolution when all clear.
    const internalTask = task as unknown as {
      completedToolCalls: unknown[];
      pendingToolCalls: Map<string, string>;
    };
    expect(internalTask.completedToolCalls.length).toBe(1);
    expect(internalTask.pendingToolCalls.size).toBe(0);
  });
});
