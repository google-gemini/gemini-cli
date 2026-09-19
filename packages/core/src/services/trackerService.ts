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
    let id = this.generateId();
    // Prevent ID collisions by checking existing tasks
    let unique = false;
    for (let i = 0; i < 10; i++) {
      const existing = await this.getTask(id);
      if (!existing) {
        unique = true;
        break;
      }
      id = this.generateId();
    }
    if (!unique) {
      throw new Error('Failed to generate a unique task ID after 10 attempts.');
    }
    const now = new Date().toISOString();
    const task: TrackerTask = {
      ...taskData,
      id,
      createdAt: taskData.createdAt ?? now,
      updatedAt: taskData.updatedAt ?? now,
    };

    if (task.parentId) {
      const parent = await this.getTask(task.parentId);
      if (!parent) {
        throw new Error(`Parent task with ID ${task.parentId} not found.`);
      }
    }

    TrackerTaskSchema.parse(task);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (error as NodeJS.ErrnoException).code === 'ENOENT'
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
    if (typeof id !== 'string' || !/^[0-9a-f]{6}$/i.test(id)) {
      return null;
    }
    await this.ensureInitialized();
    const normalizedId = id.toLowerCase();
    const taskPath = path.join(this.tasksDir, `${normalizedId}.json`);
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
    const isClosing = updates.status === TaskStatus.CLOSED;
    const changingDependencies = updates.dependencies !== undefined;

    const task = await this.getTask(id);

    if (!task) {
      throw new Error(`Task with ID ${id} not found.`);
    }

    const updatedTask = {
      ...task,
      ...updates,
      id: task.id,
      updatedAt: new Date().toISOString(),
    };

    if (updatedTask.parentId) {
      const parentExists = !!(await this.getTask(updatedTask.parentId));
      if (!parentExists) {
        throw new Error(
          `Parent task with ID ${updatedTask.parentId} not found.`,
        );
      }
    }

    if (isClosing && task.status !== TaskStatus.CLOSED) {
      await this.validateCanClose(updatedTask);
    }

    if (changingDependencies) {
      await this.validateNoCircularDependencies(updatedTask);
    }

    TrackerTaskSchema.parse(updatedTask);

    await this.saveTask(updatedTask);
    return updatedTask;
  }

  /**
   * Deletes a task by ID. Validates the ID format to prevent path traversal,
   * blocks deletion when child tasks exist, clears parentId references on
   * children if the guard is removed in future, removes the task from other
   * tasks' dependency lists, and updates timestamps on affected tasks.
   */
  async deleteTask(id: string, preloadedTasks?: TrackerTask[]): Promise<void> {
    // Path traversal guard: IDs must be exactly 6 hex chars
    if (typeof id !== 'string' || !/^[0-9a-f]{6}$/i.test(id)) {
      throw new Error(`Invalid task ID format: ${id}`);
    }
    // Normalize to lowercase for case-sensitive filesystems
    const normalizedId = id.toLowerCase();
    await this.ensureInitialized();
    const task = await this.getTask(normalizedId);
    if (!task) {
      throw new Error(`Task with ID ${normalizedId} not found.`);
    }

    // Reuse pre-loaded tasks when available (bulk-delete perf: avoids
    // re-reading the entire tracker directory for each deleted task).
    const allTasks = preloadedTasks ?? (await this.listTasks());
    const children = allTasks.filter((t) => t.parentId === normalizedId);
    if (children.length > 0) {
      const childIds = children.map((c) => c.id).join(', ');
      throw new Error(
        `Cannot delete task ${normalizedId}: it has ${children.length} child task(s) (${childIds}). Delete or re-parent them first.`,
      );
    }

    // Clean up references BEFORE deleting the task file, so a crash
    // mid-operation leaves the DB in a consistent state.
    const now = new Date().toISOString();
    for (const other of allTasks) {
      if (other.id === normalizedId) continue;
      const hasDep = other.dependencies.includes(normalizedId);
      const hasParent = other.parentId === normalizedId;
      if (hasDep || hasParent) {
        const fresh = await this.getTask(other.id);
        if (!fresh) continue;
        let freshNeedsSave = false;
        if (fresh.dependencies.includes(normalizedId)) {
          fresh.dependencies = fresh.dependencies.filter(
            (d) => d !== normalizedId,
          );
          freshNeedsSave = true;
        }
        if (fresh.parentId === normalizedId) {
          delete fresh.parentId;
          freshNeedsSave = true;
        }
        if (freshNeedsSave) {
          fresh.updatedAt = now;
          await this.saveTask(fresh);
        }
      }
    }

    // Remove the task file last
    const taskPath = path.join(this.tasksDir, `${normalizedId}.json`);
    await fs.unlink(taskPath);

    // Remove from the in-memory array so subsequent bulk deletes in
    // the same reconciliation pass see consistent state.
    if (preloadedTasks) {
      const idx = preloadedTasks.findIndex((t) => t.id === normalizedId);
      if (idx !== -1) preloadedTasks.splice(idx, 1);
    }
  }

  /**
   * Clears all tasks from the tracker directory.
   */
  async clearTasks(): Promise<void> {
    await this.ensureInitialized();
    const files = await fs.readdir(this.tasksDir);
    const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
    await Promise.all(
      jsonFiles.map((f: string) => fs.unlink(path.join(this.tasksDir, f))),
    );
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
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cache = new Map<string, TrackerTask>();
    cache.set(task.id, task);

    const check = async (currentId: string) => {
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

      let currentTask = cache.get(currentId);
      if (!currentTask) {
        const fetched = await this.getTask(currentId);
        if (!fetched) {
          throw new Error(`Dependency ${currentId} not found.`);
        }
        currentTask = fetched;
        cache.set(currentId, currentTask);
      }

      for (const depId of currentTask.dependencies) {
        await check(depId);
      }

      stack.delete(currentId);
    };

    await check(task.id);
  }
}
