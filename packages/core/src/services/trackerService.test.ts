/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { TrackerService } from './trackerService.js';
import { TaskStatus, TaskType, type TrackerTask } from './trackerTypes.js';

describe('TrackerService', () => {
  let testTrackerDir: string;
  let service: TrackerService;

  beforeEach(async () => {
    testTrackerDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tracker-service-test-'),
    );
    service = new TrackerService(testTrackerDir);
  });

  afterEach(async () => {
    await fs.rm(testTrackerDir, { recursive: true, force: true });
  });

  it('should create a task with a generated 6-char hex ID', async () => {
    const taskData: Omit<TrackerTask, 'id'> = {
      title: 'Test Task',
      description: 'Test Description',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    };

    const task = await service.createTask(taskData);
    expect(task.id).toMatch(/^[0-9a-f]{6}$/);
    expect(task.title).toBe(taskData.title);

    const savedTask = await service.getTask(task.id);
    expect(savedTask).toEqual(task);
  });

  it('should list all tasks', async () => {
    await service.createTask({
      title: 'Task 1',
      description: 'Desc 1',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });
    await service.createTask({
      title: 'Task 2',
      description: 'Desc 2',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const tasks = await service.listTasks();
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.title)).toContain('Task 1');
    expect(tasks.map((t) => t.title)).toContain('Task 2');
  });

  it('should update a task', async () => {
    const task = await service.createTask({
      title: 'Original Title',
      description: 'Original Desc',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const updated = await service.updateTask(task.id, {
      title: 'New Title',
      status: TaskStatus.IN_PROGRESS,
    });
    expect(updated.title).toBe('New Title');
    expect(updated.status).toBe('in_progress');
    expect(updated.description).toBe('Original Desc');

    const retrieved = await service.getTask(task.id);
    expect(retrieved).toEqual(updated);
  });

  it('should prevent closing a task if dependencies are not closed', async () => {
    const dep = await service.createTask({
      title: 'Dependency',
      description: 'Must be closed first',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const task = await service.createTask({
      title: 'Main Task',
      description: 'Depends on dep',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [dep.id],
    });

    await expect(
      service.updateTask(task.id, { status: TaskStatus.CLOSED }),
    ).rejects.toThrow(/Cannot close task/);

    // Close dependency
    await service.updateTask(dep.id, { status: TaskStatus.CLOSED });

    // Now it should work
    const updated = await service.updateTask(task.id, {
      status: TaskStatus.CLOSED,
    });
    expect(updated.status).toBe('closed');
  });

  it('should detect circular dependencies', async () => {
    const taskA = await service.createTask({
      title: 'Task A',
      description: 'A',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [],
    });

    const taskB = await service.createTask({
      title: 'Task B',
      description: 'B',
      type: TaskType.TASK,
      status: TaskStatus.OPEN,
      dependencies: [taskA.id],
    });

    // Try to make A depend on B
    await expect(
      service.updateTask(taskA.id, { dependencies: [taskB.id] }),
    ).rejects.toThrow(/Circular dependency detected/);
  });
});
