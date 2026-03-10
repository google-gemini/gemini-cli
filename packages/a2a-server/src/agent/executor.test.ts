/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CoderAgentExecutor } from './executor.js';
import type {
  ExecutionEventBus,
  RequestContext,
  TaskStore,
} from '@a2a-js/sdk/server';
import { EventEmitter } from 'node:events';
import { requestStorage } from '../http/requestStorage.js';

// Mocks for constructor dependencies
vi.mock('../config/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    getSessionId: () => 'test-session',
    getTargetDir: () => '/tmp',
    getCheckpointingEnabled: () => false,
  }),
  loadEnvironment: vi.fn(),
  setTargetDir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('../config/settings.js', () => ({
  loadSettings: vi.fn().mockReturnValue({}),
}));

vi.mock('../config/extension.js', () => ({
  loadExtensions: vi.fn().mockReturnValue([]),
}));

vi.mock('../http/requestStorage.js', () => ({
  requestStorage: {
    getStore: vi.fn(),
  },
}));

vi.mock('./task.js', () => {
  const mockTaskInstance = (taskId: string, contextId: string) => ({
    id: taskId,
    contextId,
    taskState: 'working',
    acceptUserMessage: vi
      .fn()
      .mockImplementation(async function* (context, aborted) {
        const isConfirmation = (
          context.userMessage.parts as Array<{ kind: string }>
        ).some((p) => p.kind === 'confirmation');
        // Hang only for main user messages (text), allow confirmations to finish quickly
        if (!isConfirmation && aborted) {
          await new Promise((resolve) => {
            aborted.addEventListener('abort', resolve, { once: true });
          });
        }
        yield { type: 'content', value: 'hello' };
      }),
    acceptAgentMessage: vi.fn().mockResolvedValue(undefined),
    scheduleToolCalls: vi.fn().mockResolvedValue(undefined),
    waitForPendingTools: vi.fn().mockResolvedValue(undefined),
    getAndClearCompletedTools: vi.fn().mockReturnValue([]),
    addToolResponsesToHistory: vi.fn(),
    sendCompletedToolsToLlm: vi.fn().mockImplementation(async function* () {}),
    cancelPendingTools: vi.fn(),
    setTaskStateAndPublishUpdate: vi.fn(),
    dispose: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({}),
    geminiClient: {
      initialize: vi.fn().mockResolvedValue(undefined),
    },
    toSDKTask: () => ({
      id: taskId,
      contextId,
      kind: 'task',
      status: { state: 'working', timestamp: new Date().toISOString() },
      metadata: {},
      history: [],
      artifacts: [],
    }),
  });

  const MockTask = vi.fn().mockImplementation(mockTaskInstance);
  (MockTask as unknown as { create: Mock }).create = vi
    .fn()
    .mockImplementation(async (taskId: string, contextId: string) =>
      mockTaskInstance(taskId, contextId),
    );

  return { Task: MockTask };
});

describe('CoderAgentExecutor', () => {
  let executor: CoderAgentExecutor;
  let mockTaskStore: TaskStore;
  let mockEventBus: ExecutionEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskStore = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as TaskStore;

    mockEventBus = new EventEmitter() as unknown as ExecutionEventBus;
    mockEventBus.publish = vi.fn();
    mockEventBus.finished = vi.fn();

    executor = new CoderAgentExecutor(mockTaskStore);
  });

  it('should distinguish between primary and secondary execution', async () => {
    const taskId = 'test-task';
    const contextId = 'test-context';

    const mockSocket = new EventEmitter();
    const requestContext = {
      userMessage: {
        messageId: 'msg-1',
        taskId,
        contextId,
        parts: [{ kind: 'text', text: 'hi' }],
        metadata: {
          coderAgent: { kind: 'agent-settings', workspacePath: '/tmp' },
        },
      },
    } as unknown as RequestContext;

    // Mock requestStorage for primary
    (requestStorage.getStore as Mock).mockReturnValue({
      req: { socket: mockSocket },
    });

    // First execution (Primary)
    const primaryPromise = executor.execute(requestContext, mockEventBus);

    // Give it enough time to reach line 490 in executor.ts
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      (
        executor as unknown as { executingTasks: Set<string> }
      ).executingTasks.has(taskId),
    ).toBe(true);
    const wrapper = executor.getTask(taskId);
    expect(wrapper).toBeDefined();

    // Mock requestStorage for secondary
    const secondarySocket = new EventEmitter();
    (requestStorage.getStore as Mock).mockReturnValue({
      req: { socket: secondarySocket },
    });

    const secondaryRequestContext = {
      userMessage: {
        messageId: 'msg-2',
        taskId,
        contextId,
        parts: [{ kind: 'confirmation', callId: '1', outcome: 'proceed' }],
        metadata: {
          coderAgent: { kind: 'agent-settings', workspacePath: '/tmp' },
        },
      },
    } as unknown as RequestContext;

    const secondaryPromise = executor.execute(
      secondaryRequestContext,
      mockEventBus,
    );

    // Secondary execution should NOT add to executingTasks (already there)
    // and should return early after its loop
    await secondaryPromise;

    // Task should still be in executingTasks and NOT disposed
    expect(
      (
        executor as unknown as { executingTasks: Set<string> }
      ).executingTasks.has(taskId),
    ).toBe(true);
    expect(wrapper?.task.dispose).not.toHaveBeenCalled();

    // Now simulate secondary socket closure - it should NOT affect primary
    secondarySocket.emit('end');
    expect(
      (
        executor as unknown as { executingTasks: Set<string> }
      ).executingTasks.has(taskId),
    ).toBe(true);
    expect(wrapper?.task.dispose).not.toHaveBeenCalled();

    // Set to terminal state to verify disposal on finish
    wrapper!.task.taskState = 'completed';

    // Now close primary socket
    mockSocket.emit('end');

    await primaryPromise;

    expect(
      (
        executor as unknown as { executingTasks: Set<string> }
      ).executingTasks.has(taskId),
    ).toBe(false);
    expect(wrapper?.task.dispose).toHaveBeenCalled();
  });

  it('should evict task from cache when it reaches terminal state', async () => {
    const taskId = 'test-task-terminal';
    const contextId = 'test-context';

    const mockSocket = new EventEmitter();
    (requestStorage.getStore as Mock).mockReturnValue({
      req: { socket: mockSocket },
    });

    const requestContext = {
      userMessage: {
        messageId: 'msg-1',
        taskId,
        contextId,
        parts: [{ kind: 'text', text: 'hi' }],
        metadata: {
          coderAgent: { kind: 'agent-settings', workspacePath: '/tmp' },
        },
      },
    } as unknown as RequestContext;

    const primaryPromise = executor.execute(requestContext, mockEventBus);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const wrapper = executor.getTask(taskId)!;
    expect(wrapper).toBeDefined();
    // Simulate terminal state
    wrapper.task.taskState = 'completed';

    // Finish primary execution
    mockSocket.emit('end');
    await primaryPromise;

    expect(executor.getTask(taskId)).toBeUndefined();
    expect(wrapper.task.dispose).toHaveBeenCalled();
  });
});
