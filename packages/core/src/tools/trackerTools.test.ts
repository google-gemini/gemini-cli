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
  TrackerInitTool,
  TrackerCreateTaskTool,
  TrackerListTasksTool,
  TrackerUpdateTaskTool,
} from './trackerTools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

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
      model: 'gemini-2.0-flash',
      debugMode: false,
    });
    messageBus = new MessageBus(null as unknown as PolicyEngine, false);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const getSignal = () => new AbortController().signal;

  it('runs tracker_init and creates the directory', async () => {
    const tool = new TrackerInitTool(config, messageBus);
    const result = await tool.buildAndExecute({}, getSignal());

    expect(result.llmContent).toContain('Task tracker initialized');
    const trackerDir = config.getTrackerService().trackerDir;
    const tasksDir = path.join(trackerDir, 'tasks');
    const stats = await fs.stat(tasksDir);
    expect(stats.isDirectory()).toBe(true);
    // Verify it is NOT in the tempDir root (which was the old behavior)
    expect(trackerDir).not.toBe(path.join(tempDir, '.tracker'));
  });

  it('creates and lists tasks', async () => {
    // Init first
    await new TrackerInitTool(config, messageBus).buildAndExecute(
      {},
      getSignal(),
    );

    const createTool = new TrackerCreateTaskTool(config, messageBus);
    const createResult = await createTool.buildAndExecute(
      {
        title: 'Test Task',
        description: 'Test Description',
        type: 'task',
      },
      getSignal(),
    );

    expect(createResult.llmContent).toContain('Created task');

    const listTool = new TrackerListTasksTool(config, messageBus);
    const listResult = await listTool.buildAndExecute({}, getSignal());
    expect(listResult.llmContent).toContain('Test Task');
    expect(listResult.llmContent).toContain('(open)');
  });

  it('updates task status', async () => {
    await new TrackerInitTool(config, messageBus).buildAndExecute(
      {},
      getSignal(),
    );

    const createTool = new TrackerCreateTaskTool(config, messageBus);
    await createTool.buildAndExecute(
      {
        title: 'Update Me',
        description: '...',
        type: 'task',
      },
      getSignal(),
    );

    const tasks = await config.getTrackerService().listTasks();
    const taskId = tasks[0].id;

    const updateTool = new TrackerUpdateTaskTool(config, messageBus);
    const updateResult = await updateTool.buildAndExecute(
      {
        id: taskId,
        status: 'in_progress',
      },
      getSignal(),
    );

    expect(updateResult.llmContent).toContain('Status: in_progress');

    const task = await config.getTrackerService().getTask(taskId);
    expect(task?.status).toBe('in_progress');
  });
});
