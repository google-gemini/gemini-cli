/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Config } from '../config/config.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import {
  TrackerCreateTaskTool,
  TrackerListTasksTool,
  TrackerUpdateTaskTool,
  TrackerVisualizeTool,
  TrackerAddDependencyTool,
  buildTodosReturnDisplay,
} from './trackerTools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { TaskStatus, TaskType } from '../services/trackerTypes.js';
import type { TrackerService } from '../services/trackerService.js';

describe('Tracker Tools Integration', () => {
  let tempDir: string;
  let config: Config;
  let messageBus: MessageBus;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-tools-test-'));
    config = new Config({
      sessionId: 'test-session',
      targetDir: tempDir,
      cwd: tempDir,
      model: 'gemini-3-flash',
      debugMode: false,
    });
    messageBus = new MessageBus(null as unknown as PolicyEngine, false);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const getSignal = () => new AbortController().signal;

  it('creates and lists tasks', async () => {
    const createTool = new TrackerCreateTaskTool(config, messageBus);
    const createResult = await createTool.buildAndExecute(
      {
        title: 'Test Task',
        description: 'Test Description',
        type: TaskType.TASK,
      },
      getSignal(),
    );

    expect(createResult.llmContent).toContain('Created task');

    const listTool = new TrackerListTasksTool(config, messageBus);
    const listResult = await listTool.buildAndExecute({}, getSignal());
    expect(listResult.llmContent).toContain('Test Task');
    expect(listResult.llmContent).toContain(`(${TaskStatus.OPEN})`);
  });

  it('updates task status', async () => {
    const createTool = new TrackerCreateTaskTool(config, messageBus);
    await createTool.buildAndExecute(
      {
        title: 'Update Me',
        description: '...',
        type: TaskType.TASK,
      },
      getSignal(),
    );

    const tasks = await config.getTrackerService().listTasks();
    const taskId = tasks[0].id;

    const updateTool = new TrackerUpdateTaskTool(config, messageBus);
    const updateResult = await updateTool.buildAndExecute(
      {
        id: taskId,
        status: TaskStatus.IN_PROGRESS,
      },
      getSignal(),
    );

    expect(updateResult.llmContent).toContain(
      `Status: ${TaskStatus.IN_PROGRESS}`,
    );

    const task = await config.getTrackerService().getTask(taskId);
    expect(task?.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it('adds dependencies and visualizes the graph', async () => {
    const createTool = new TrackerCreateTaskTool(config, messageBus);

    // Create Parent
    await createTool.buildAndExecute(
      {
        title: 'Parent Task',
        description: '...',
        type: TaskType.TASK,
      },
      getSignal(),
    );

    // Create Child
    await createTool.buildAndExecute(
      {
        title: 'Child Task',
        description: '...',
        type: TaskType.TASK,
      },
      getSignal(),
    );

    const tasks = await config.getTrackerService().listTasks();
    const parentId = tasks.find((t) => t.title === 'Parent Task')!.id;
    const childId = tasks.find((t) => t.title === 'Child Task')!.id;

    // Add Dependency
    const addDepTool = new TrackerAddDependencyTool(config, messageBus);
    await addDepTool.buildAndExecute(
      {
        taskId: parentId,
        dependencyId: childId,
      },
      getSignal(),
    );

    const updatedParent = await config.getTrackerService().getTask(parentId);
    expect(updatedParent?.dependencies).toContain(childId);

    // Visualize
    const vizTool = new TrackerVisualizeTool(config, messageBus);
    const vizResult = await vizTool.buildAndExecute({}, getSignal());

    expect(vizResult.llmContent).toContain('Parent Task');
    expect(vizResult.llmContent).toContain('Child Task');
    expect(vizResult.llmContent).toContain(childId);
  });

  describe('buildTodosReturnDisplay', () => {
    it('returns empty list for no tasks', async () => {
      const mockService = {
        listTasks: async () => [],
      } as unknown as TrackerService;
      const result = await buildTodosReturnDisplay(mockService);
      expect(result.todos).toEqual([]);
    });

    it('returns formatted todos', async () => {
      const parent = {
        id: 'p1',
        title: 'Parent',
        type: TaskType.TASK,
        status: TaskStatus.IN_PROGRESS,
        dependencies: [],
      };
      const child = {
        id: 'c1',
        title: 'Child',
        type: TaskType.EPIC,
        status: TaskStatus.OPEN,
        parentId: 'p1',
        dependencies: [],
      };
      const closedLeaf = {
        id: 'leaf',
        title: 'Closed Leaf',
        type: TaskType.BUG,
        status: TaskStatus.CLOSED,
        parentId: 'c1',
        dependencies: [],
      };

      const mockService = {
        listTasks: async () => [parent, child, closedLeaf],
      } as unknown as TrackerService;
      const display = await buildTodosReturnDisplay(mockService);

      expect(display.todos).toEqual([
        {
          description: `task: Parent (p1)`,
          status: 'in_progress',
        },
        {
          description: `  epic: Child (c1)`,
          status: 'pending',
        },
        {
          description: `    bug: Closed Leaf (leaf)`,
          status: 'completed',
        },
      ]);
    });

    it('sorts tasks by status', async () => {
      const t1 = {
        id: 't1',
        title: 'T1',
        type: TaskType.TASK,
        status: TaskStatus.CLOSED,
        dependencies: [],
      };
      const t2 = {
        id: 't2',
        title: 'T2',
        type: TaskType.TASK,
        status: TaskStatus.OPEN,
        dependencies: [],
      };
      const t3 = {
        id: 't3',
        title: 'T3',
        type: TaskType.TASK,
        status: TaskStatus.IN_PROGRESS,
        dependencies: [],
      };

      const mockService = {
        listTasks: async () => [t1, t2, t3],
      } as unknown as TrackerService;
      const display = await buildTodosReturnDisplay(mockService);

      expect(display.todos).toEqual([
        { description: `task: T3 (t3)`, status: 'in_progress' },
        { description: `task: T2 (t2)`, status: 'pending' },
        { description: `task: T1 (t1)`, status: 'completed' },
      ]);
    });

    it('detects cycles', async () => {
      // Since TrackerTask only has a single parentId, a true cycle is unreachable from roots.
      // We simulate a database corruption (two tasks with same ID, one root, one child)
      // just to exercise the protective cycle detection branch.
      const rootP1 = {
        id: 'p1',
        title: 'Parent',
        type: TaskType.TASK,
        status: TaskStatus.OPEN,
        dependencies: [],
      };
      const childP1 = { ...rootP1, parentId: 'p1' };

      const mockService = {
        listTasks: async () => [rootP1, childP1],
      } as unknown as TrackerService;
      const display = await buildTodosReturnDisplay(mockService);

      expect(display.todos).toEqual([
        {
          description: `task: Parent (p1)`,
          status: 'pending',
        },
        {
          description: `  [CYCLE DETECTED: p1]`,
          status: 'cancelled',
        },
      ]);
    });
  });
});
