/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Task } from './task.js';
import {
  MessageBusType,
  CoreToolCallStatus,
  type Config,
  type MessageBus,
} from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { RequestContext } from '@a2a-js/sdk/server';

describe('Task Race Condition', () => {
  let mockConfig: Config;
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn(),
    } as unknown as MessageBus;
    mockConfig = createMockConfig({
      messageBus,
    }) as Config;
  });

  it('should not hang when multiple tool confirmations are processed while waiting', async () => {
    // @ts-expect-error - private constructor
    const task = new Task('task-id', 'context-id', mockConfig);

    // 1. Register two tools as scheduled
    task['_registerToolCall']('tool-1', 'scheduled');
    task['_registerToolCall']('tool-2', 'scheduled');

    // 2. Both transition to awaiting_approval
    const updateHandler = (messageBus.subscribe as Mock).mock.calls.find(
      (c: unknown[]) => c[0] === MessageBusType.TOOL_CALLS_UPDATE,
    )?.[1];

    updateHandler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      schedulerId: 'task-id',
      toolCalls: [
        {
          request: { callId: 'tool-1', name: 't1' },
          status: CoreToolCallStatus.AwaitingApproval,
          correlationId: 'corr-1',
          confirmationDetails: { type: 'info' },
        },
        {
          request: { callId: 'tool-2', name: 't2' },
          status: CoreToolCallStatus.AwaitingApproval,
          correlationId: 'corr-2',
          confirmationDetails: { type: 'info' },
        },
      ],
    });

    // 3. Start waiting for tools. This will await the current toolCompletionPromise.
    const waitPromise = task.waitForPendingTools();

    // 4. Handle confirmation for Tool 1.
    // Before the fix, this would call _resetToolCompletionPromise and overwrite the promise waitPromise is awaiting.
    await task.acceptUserMessage(
      {
        userMessage: {
          parts: [
            {
              kind: 'data',
              data: { callId: 'tool-1', outcome: 'proceed_once' },
            },
          ],
        },
      } as unknown as RequestContext,
      new AbortController().signal,
    );

    // 5. Handle confirmation for Tool 2.
    // Before the fix, this would overwrite the promise AGAIN.
    await task.acceptUserMessage(
      {
        userMessage: {
          parts: [
            {
              kind: 'data',
              data: { callId: 'tool-2', outcome: 'proceed_once' },
            },
          ],
        },
      } as unknown as RequestContext,
      new AbortController().signal,
    );

    // 6. Both tools complete successfully
    updateHandler({
      type: MessageBusType.TOOL_CALLS_UPDATE,
      schedulerId: 'task-id',
      toolCalls: [
        {
          request: { callId: 'tool-1', name: 't1' },
          status: CoreToolCallStatus.Success,
          response: { responseParts: [] },
        },
        {
          request: { callId: 'tool-2', name: 't2' },
          status: CoreToolCallStatus.Success,
          response: { responseParts: [] },
        },
      ],
    });

    // 7. Verify that the original waitPromise resolves.
    // Without the fix, this would hang indefinitely (or timeout in the test).
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('should reject waitForPendingTools when tools are cancelled', async () => {
    // @ts-expect-error - private constructor
    const task = new Task('task-id', 'context-id', mockConfig);

    // 1. Register a tool
    task['_registerToolCall']('tool-1', 'scheduled');

    // 2. Start waiting
    const waitPromise = task.waitForPendingTools();

    // 3. Cancel pending tools
    task.cancelPendingTools('User requested cancellation');

    // 4. Verify waitPromise rejects with the reason
    await expect(waitPromise).rejects.toThrow('User requested cancellation');
  });

  it('should handle concurrent tool scheduling correctly', async () => {
    // @ts-expect-error - private constructor
    const task = new Task('task-id', 'context-id', mockConfig);

    // 1. Register a tool and start waiting
    task['_registerToolCall']('tool-1', 'scheduled');
    const waitPromise = task.waitForPendingTools();

    // 2. Schedule another tool concurrently (e.g. from a secondary user message)
    // This should NOT resolve the current waitPromise until both are done
    await task.scheduleToolCalls(
      [{ callId: 'tool-2', name: 't2', args: {} }],
      new AbortController().signal,
    );

    expect(task['pendingToolCalls'].size).toBe(2);

    // 3. Resolve tool 1
    task['_resolveToolCall']('tool-1');

    // 4. Verify waitPromise is still pending
    let resolved = false;
    waitPromise.then(() => (resolved = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolved).toBe(false);

    // 5. Resolve tool 2
    task['_resolveToolCall']('tool-2');

    // 6. Now it should resolve
    await expect(waitPromise).resolves.toBeUndefined();
  });
});
