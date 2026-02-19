/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { TrackerTaskSchema, type TrackerTask } from './trackerTypes.js';

export class TrackerService {
  private readonly tasksDir: string;

  constructor(readonly trackerDir: string) {
    this.tasksDir = trackerDir;
  }

  /**
   * Initializes the tracker storage if it doesn't exist.
   */
  async ensureInitialized(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
  }

  /**
   * Generates a 6-character hex ID.
   */
  private generateId(): string {
    return randomBytes(3).toString('hex');
  }

  /**
   * Creates a new task and saves it to disk.
   */
  async createTask(taskData: Omit<TrackerTask, 'id'>): Promise<TrackerTask> {
    await this.ensureInitialized();
    const id = this.generateId();
    const task: TrackerTask = {
      ...taskData,
      id,
    };

    await this.saveTask(task);
    return task;
  }

  /**
   * Reads a task by ID.
   */
  async getTask(id: string): Promise<TrackerTask | null> {
    const taskPath = path.join(this.tasksDir, `${id}.json`);
    try {
      const content = await fs.readFile(taskPath, 'utf8');
      const data: unknown = JSON.parse(content);
      return TrackerTaskSchema.parse(data);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Lists all tasks in the tracker.
   */
  async listTasks(): Promise<TrackerTask[]> {
    await this.ensureInitialized();
    try {
      const files = await fs.readdir(this.tasksDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const tasks = await Promise.all(
        jsonFiles.map(async (f) => {
          const content = await fs.readFile(
            path.join(this.tasksDir, f),
            'utf8',
          );
          const data: unknown = JSON.parse(content);
          return TrackerTaskSchema.parse(data);
        }),
      );
      return tasks;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Updates an existing task and saves it to disk.
   */
  async updateTask(
    id: string,
    updates: Partial<TrackerTask>,
  ): Promise<TrackerTask> {
    const task = await this.getTask(id);
    if (!task) {
      throw new Error(`Task with ID ${id} not found.`);
    }

    const updatedTask = { ...task, ...updates };

    // Validate status transition if closing
    if (updatedTask.status === 'closed' && task.status !== 'closed') {
      await this.validateCanClose(updatedTask);
    }

    // Validate circular dependencies if dependencies changed
    if (updates.dependencies) {
      await this.validateNoCircularDependencies(updatedTask);
    }

    await this.saveTask(updatedTask);
    return updatedTask;
  }

  /**
   * Saves a task to disk.
   */
  private async saveTask(task: TrackerTask): Promise<void> {
    const taskPath = path.join(this.tasksDir, `${task.id}.json`);
    await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf8');
  }

  /**
   * Validates that a task can be closed (all dependencies must be closed).
   */
  private async validateCanClose(task: TrackerTask): Promise<void> {
    for (const depId of task.dependencies) {
      const dep = await this.getTask(depId);
      if (!dep) {
        throw new Error(`Dependency ${depId} not found for task ${task.id}.`);
      }
      if (dep.status !== 'closed') {
        throw new Error(
          `Cannot close task ${task.id} because dependency ${depId} is still ${dep.status}.`,
        );
      }
    }
  }

  /**
   * Validates that there are no circular dependencies.
   */
  private async validateNoCircularDependencies(
    task: TrackerTask,
  ): Promise<void> {
    const allTasks = await this.listTasks();
    const taskMap = new Map<string, TrackerTask>(
      allTasks.map((t) => [t.id, t]),
    );
    // Ensure the current (possibly unsaved) task state is used
    taskMap.set(task.id, task);

    const visited = new Set<string>();
    const stack = new Set<string>();

    const check = (currentId: string) => {
      if (stack.has(currentId)) {
        throw new Error(
          `Circular dependency detected involving task ${currentId}.`,
        );
      }
      if (visited.has(currentId)) {
        return;
      }

      visited.add(currentId);
      stack.add(currentId);

      const currentTask = taskMap.get(currentId);
      if (currentTask) {
        for (const depId of currentTask.dependencies) {
          check(depId);
        }
      }

      stack.delete(currentId);
    };

    check(task.id);
  }
}
