/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ExecutionEventBus, TaskStore } from '@a2a-js/sdk/server';
import type { Task as SDKTask } from '@a2a-js/sdk';
import { CoderAgentExecutor } from './executor.js';
import type { AgentSettings } from '../types.js';

// Mock all dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../config/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
  loadEnvironment: vi.fn(),
  setTargetDir: vi.fn().mockReturnValue('/workspace'),
}));

vi.mock('../config/settings.js', () => ({
  loadSettings: vi.fn().mockReturnValue({}),
}));

vi.mock('../config/extension.js', () => ({
  loadExtensions: vi.fn().mockReturnValue([]),
}));

vi.mock('./task.js', () => ({
  Task: {
    create: vi.fn().mockImplementation((id: string, contextId: string) => Promise.resolve({
        id,
        contextId,
        taskState: 'submitted',
        geminiClient: {
          initialize: vi.fn().mockResolvedValue(undefined),
        },
        eventBus: undefined,
        acceptUserMessage: vi.fn().mockReturnValue((async function* () {})()),
        acceptAgentMessage: vi.fn().mockResolvedValue(undefined),
        scheduleToolCalls: vi.fn().mockResolvedValue(undefined),
        waitForPendingTools: vi.fn().mockResolvedValue(undefined),
        getAndClearCompletedTools: vi.fn().mockReturnValue([]),
        addToolResponsesToHistory: vi.fn(),
        sendCompletedToolsToLlm: vi
          .fn()
          .mockReturnValue((async function* () {})()),
        setTaskStateAndPublishUpdate: vi.fn(),
        cancelPendingTools: vi.fn(),
      })),
  },
}));

vi.mock('../http/requestStorage.js', () => ({
  requestStorage: {
    getStore: vi.fn(),
  },
}));

vi.mock('../utils/executor_utils.js', () => ({
  pushTaskStateFailed: vi.fn(),
}));

vi.mock('../types.js', () => ({
  CoderAgentEvent: {
    StateChangeEvent: 'state-change',
  },
  getPersistedState: vi.fn(),
  setPersistedState: vi.fn((metadata, state) => ({ ...metadata, ...state })),
}));

describe('CoderAgentExecutor', () => {
  let executor: CoderAgentExecutor;
  let mockTaskStore: TaskStore;
  let mockEventBus: ExecutionEventBus;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTaskStore = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockEventBus = {
      publish: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
      finished: vi.fn(),
    };

    executor = new CoderAgentExecutor(mockTaskStore);
  });

  describe('createTask', () => {
    it('should create a new task with provided settings', async () => {
      const taskId = 'task-123';
      const contextId = 'context-456';
      const agentSettings: AgentSettings = { workspaceRoot: '/test' };

      const wrapper = await executor.createTask(
        taskId,
        contextId,
        agentSettings,
        mockEventBus,
      );

      expect(wrapper).toBeDefined();
      expect(wrapper.id).toBe(taskId);
      expect(wrapper.agentSettings).toEqual(agentSettings);
    });

    it('should create task with empty settings if not provided', async () => {
      const wrapper = await executor.createTask('task-1', 'ctx-1');

      expect(wrapper).toBeDefined();
      expect(wrapper.agentSettings).toEqual({});
    });

    it('should store created task in tasks map', async () => {
      const taskId = 'task-store-test';

      await executor.createTask(taskId, 'ctx-1');

      const retrieved = executor.getTask(taskId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(taskId);
    });
  });

  describe('getTask', () => {
    it('should return task if it exists', async () => {
      const taskId = 'existing-task';
      await executor.createTask(taskId, 'ctx-1');

      const result = executor.getTask(taskId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(taskId);
    });

    it('should return undefined if task does not exist', () => {
      const result = executor.getTask('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllTasks', () => {
    it('should return empty array when no tasks exist', () => {
      const tasks = executor.getAllTasks();

      expect(tasks).toEqual([]);
    });

    it('should return all created tasks', async () => {
      await executor.createTask('task-1', 'ctx-1');
      await executor.createTask('task-2', 'ctx-2');
      await executor.createTask('task-3', 'ctx-3');

      const tasks = executor.getAllTasks();

      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.id)).toContain('task-1');
      expect(tasks.map((t) => t.id)).toContain('task-2');
      expect(tasks.map((t) => t.id)).toContain('task-3');
    });
  });

  describe('reconstruct', () => {
    it('should throw error if persisted state is missing', async () => {
      const { getPersistedState } = await import('../types.js');
      vi.mocked(getPersistedState).mockReturnValue(null);

      const sdkTask: SDKTask = {
        id: 'task-1',
        contextId: 'ctx-1',
        kind: 'task',
        status: { state: 'submitted', timestamp: new Date().toISOString() },
        history: [],
        artifacts: [],
      };

      await expect(executor.reconstruct(sdkTask, mockEventBus)).rejects.toThrow(
        'Cannot reconstruct task task-1: missing persisted state in metadata',
      );
    });

    it('should reconstruct task from SDKTask with persisted state', async () => {
      const { getPersistedState } = await import('../types.js');
      vi.mocked(getPersistedState).mockReturnValue({
        _agentSettings: { workspaceRoot: '/test' },
        _taskState: 'input-required',
      });

      const sdkTask: SDKTask = {
        id: 'task-recon',
        contextId: 'ctx-recon',
        kind: 'task',
        status: {
          state: 'input-required',
          timestamp: new Date().toISOString(),
        },
        metadata: { some: 'data' },
        history: [],
        artifacts: [],
      };

      const wrapper = await executor.reconstruct(sdkTask, mockEventBus);

      expect(wrapper).toBeDefined();
      expect(wrapper.id).toBe('task-recon');
    });
  });

  describe('cancelTask', () => {
    it('should publish failed status if task not found', async () => {
      await executor.cancelTask('non-existent', mockEventBus);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'status-update',
          taskId: 'non-existent',
          status: expect.objectContaining({
            state: 'failed',
          }),
        }),
      );
    });

    it('should not cancel task already in final state', async () => {
      const wrapper = await executor.createTask('already-canceled', 'ctx-1');
      // Manually set the task to a final state
      wrapper.task.taskState = 'canceled';

      await executor.cancelTask('already-canceled', mockEventBus);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.objectContaining({
            state: 'canceled',
          }),
        }),
      );
    });
  });

  describe('toSDKTask conversion', () => {
    it('should convert TaskWrapper to SDKTask with correct structure', async () => {
      const wrapper = await executor.createTask('task-sdk', 'ctx-sdk', {
        workspaceRoot: '/test',
      });

      const sdkTask = wrapper.toSDKTask();

      expect(sdkTask).toMatchObject({
        id: 'task-sdk',
        kind: 'task',
        status: expect.objectContaining({
          state: expect.any(String),
          timestamp: expect.any(String),
        }),
        history: [],
        artifacts: [],
      });
      expect(sdkTask.metadata).toBeDefined();
    });
  });
});
