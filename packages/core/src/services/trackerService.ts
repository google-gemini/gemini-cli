/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';
import {
  TrackerTaskSchema,
  TaskStatus,
  type TrackerTask,
} from './trackerTypes.js';
import { type z } from 'zod';

export class TrackerService {
  private readonly tasksDir: string;

  private initialized = false;

  constructor(readonly trackerDir: string) {
    this.tasksDir = trackerDir;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(this.tasksDir, { recursive: true });
      this.initialized = true;
    }
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
   * Helper to read and validate a JSON file.
   */
  private async readJsonFile<T>(
    filePath: string,
    schema: z.ZodSchema<T>,
  ): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data: unknown = JSON.parse(content);
      return schema.parse(data);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }

      const fileName = path.basename(filePath);
      debugLogger.warn(`Failed to read or parse task file ${fileName}:`, error);
      coreEvents.emitFeedback(
        'warning',
        `Task tracker encountered an issue reading ${fileName}. The data might be corrupted.`,
        error,
      );
      throw error;
    }
  }

  /**
   * Reads a task by ID.
   */
  async getTask(id: string): Promise<TrackerTask | null> {
    await this.ensureInitialized();
    const taskPath = path.join(this.tasksDir, `${id}.json`);
    return this.readJsonFile(taskPath, TrackerTaskSchema);
  }

  /**
   * Lists all tasks in the tracker.
   */
  async listTasks(): Promise<TrackerTask[]> {
    await this.ensureInitialized();
    try {
      const files = await fs.readdir(this.tasksDir);
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
      const tasks = await Promise.all(
        jsonFiles.map(async (f: string) => {
          const taskPath = path.join(this.tasksDir, f);
          return this.readJsonFile(taskPath, TrackerTaskSchema);
        }),
      );
      return tasks.filter((t): t is TrackerTask => t !== null);
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
    if (
      updatedTask.status === TaskStatus.CLOSED &&
      task.status !== TaskStatus.CLOSED
    ) {
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
      if (dep.status !== TaskStatus.CLOSED) {
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
