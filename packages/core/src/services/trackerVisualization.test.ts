/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { TrackerService } from './trackerService.js';
import { TaskStatus, TaskType } from './trackerTypes.js';
import {
  TrackerVisualizer,
  executeWithVisualization,
  buildAsciiTree,
} from './trackerVisualization.js';

/**
 * Test helpers
 */

let testTrackerDir: string;
let service: TrackerService;
let viz: TrackerVisualizer;

let stdoutLines: string[];
let writeStub: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  stdoutLines = [];

  // Force TTY mode so TerminalRenderer uses process.stdout.write (which is
  // stubbed below). Without this, isTTY() returns false in Vitest and the
  // renderer takes the non-TTY branch — output still goes through
  // process.stdout.write in that path too, but cursor calls are skipped.
  Object.defineProperty(process.stdout, 'isTTY', {
    value: true,
    configurable: true,
  });

  testTrackerDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'tracker-viz-test-'),
  );

  service = new TrackerService(testTrackerDir);
  viz = new TrackerVisualizer(service);

  writeStub = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      // eslint-disable-next-line no-control-regex
      const line = text.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
      if (line) stdoutLines.push(line);
      return true;
    });
});

afterEach(async () => {
  writeStub.mockRestore();

  // Restore isTTY to undefined (default Vitest value)
  Object.defineProperty(process.stdout, 'isTTY', {
    value: undefined,
    configurable: true,
  });

  await fs.rm(testTrackerDir, { recursive: true, force: true });
});

/**
 * buildAsciiTree unit tests
 * Tests the O(n) children index, single-pass stats, and iterative traversal.
 */

describe('buildAsciiTree', () => {
  it('renders parent before child with correct tree connectors', async () => {
    const parent = await service.createTask({
      title: 'Parent',
      description: '',
      type: TaskType.EPIC,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.createTask({
      title: 'Child',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
      parentId: parent.id,
    });

    const tasks = await service.listTasks();
    const tree = buildAsciiTree(tasks);

    const parentPos = tree.indexOf('Parent');
    const childPos = tree.indexOf('Child');

    expect(parentPos).toBeGreaterThanOrEqual(0);
    expect(childPos).toBeGreaterThan(parentPos);

    const childLine = tree.split('\n').find((l) => l.includes('Child'))!;
    expect(childLine).toMatch(/[└├]/);
  });

  it('handles deeply nested tasks without stack overflow (iterative traversal)', async () => {
    let parentId: string | undefined;

    for (const title of [
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
    ]) {
      const task = await service.createTask({
        title,
        description: '',
        type: TaskType.TASK,
        status: TaskStatus.OPEN,
        dependencies: [],
        ...(parentId ? { parentId } : {}),
      });
      parentId = task.id;
    }

    const tasks = await service.listTasks();

    expect(() => buildAsciiTree(tasks)).not.toThrow();

    const tree = buildAsciiTree(tasks);
    expect(tree).toContain('Level 1');
    expect(tree).toContain('Level 5');
  });

  it('counts all statuses correctly in the progress line', async () => {
    await service.createTask({
      title: 'Open Task',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const t2 = await service.createTask({
      title: 'In Progress',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const t3 = await service.createTask({
      title: 'Done',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.updateTask(t2.id, { status: TaskStatus.IN_PROGRESS });
    await service.updateTask(t3.id, { status: TaskStatus.CLOSED });

    const tasks = await service.listTasks();
    const tree = buildAsciiTree(tasks);

    expect(tree).toContain('●1');
    expect(tree).toContain('◉1');
    expect(tree).toContain('○1');
    expect(tree).toContain('/ 3 tasks');
  });
});

/**
 * TrackerVisualizer tests
 */

describe('TrackerVisualizer', () => {
  it('renders a header containing tracker_visualize()', async () => {
    await service.createTask({
      title: 'Sample Task',
      description: 'desc',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await viz.render();

    const output = stdoutLines.join('\n');
    expect(output).toContain('tracker_visualize()');
  });

  it('renders task title and ID', async () => {
    const task = await service.createTask({
      title: 'My Important Task',
      description: 'desc',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).toContain('My Important Task');
    expect(output).toContain(task.id);
  });

  it('renders correct status symbol (IN_PROGRESS)', async () => {
    const task = await service.createTask({
      title: 'Open',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.updateTask(task.id, { status: TaskStatus.IN_PROGRESS });

    await viz.render();

    const output = stdoutLines.join('\n');
    expect(output).toContain('◉');
  });

  it('renders EPIC and BUG type icons', async () => {
    await service.createTask({
      title: 'Big Epic',
      description: '',
      type: TaskType.EPIC,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.createTask({
      title: 'A Bug',
      description: '',
      type: TaskType.BUG,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).toContain('⬡'); // EPIC
    expect(output).toContain('⚑'); // BUG
  });

  it('renders active-task callout when setActiveTask is used', async () => {
    const task = await service.createTask({
      title: 'Running Task',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.IN_PROGRESS,
      dependencies: [],
    });

    viz.setActiveTask(task.id);

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).toContain('Running:');
    expect(output).toContain('Running Task');
  });

  it('removes active-task callout after clearing active task', async () => {
    const task = await service.createTask({
      title: 'Was Running',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.CLOSED,
      dependencies: [],
    });

    viz.setActiveTask(task.id);
    viz.setActiveTask(undefined);

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).not.toContain('Running:');
  });

  it('renders dependency IDs', async () => {
    const dep = await service.createTask({
      title: 'Dependency',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.createTask({
      title: 'Dependent',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [dep.id],
    });

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).toContain(dep.id);
  });

  it('renders 0% progress when nothing is closed', async () => {
    await service.createTask({
      title: 'Pending',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await viz.render();

    const output = stdoutLines.join('\n');
    expect(output).toContain('0%');
  });

  it('renders 100% progress when everything is closed', async () => {
    const task = await service.createTask({
      title: 'Done',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await service.updateTask(task.id, { status: TaskStatus.CLOSED });

    await viz.render();

    const output = stdoutLines.join('\n');
    expect(output).toContain('100%');
  });

  it('outputs content without cursor manipulation when stdout is not a TTY', async () => {
    await service.createTask({
      title: 'Any Task',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    stdoutLines = [];
    await viz.render();

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const output = stdoutLines.join('\n');
    expect(output).toContain('tracker_visualize()');
  });
});

/**
 * executeWithVisualization tests
 */

describe('executeWithVisualization', () => {
  it('sets status IN_PROGRESS then CLOSED on success', async () => {
    const task = await service.createTask({
      title: 'Work Item',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await executeWithVisualization(service, viz, task.id, async () => {
      const mid = await service.getTask(task.id);
      expect(mid?.status).toBe(TaskStatus.IN_PROGRESS);
    });

    const final = await service.getTask(task.id);
    expect(final?.status).toBe(TaskStatus.CLOSED);
  });

  it('sets status BLOCKED when callback throws', async () => {
    const task = await service.createTask({
      title: 'Failing Item',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await expect(
      executeWithVisualization(service, viz, task.id, async () => {
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');

    const final = await service.getTask(task.id);
    expect(final?.status).toBe(TaskStatus.BLOCKED);
  });

  it('clears active task callout after completion', async () => {
    const task = await service.createTask({
      title: 'Quick Task',
      description: '',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    await executeWithVisualization(service, viz, task.id, async () => {});

    stdoutLines = [];

    await viz.render();

    const output = stdoutLines.join('\n');

    expect(output).not.toContain('Running:');
  });
});
