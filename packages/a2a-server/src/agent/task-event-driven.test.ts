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
});
