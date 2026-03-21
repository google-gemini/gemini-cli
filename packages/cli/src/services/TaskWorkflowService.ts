/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskRun } from './task/types.js';
import { persistentState } from '../utils/persistentState.js';
import { ActivityLogger } from '../utils/activityLogger.js';

const DEFAULT_PHASES = ['plan', 'execute', 'verify', 'summarize'] as const;
const MAX_HISTORY = 20;

/**
 * In-memory task workflow store for slash-command orchestration.
 * This is intentionally small for the first vertical slice.
 */
export class TaskWorkflowService {
  private static instance: TaskWorkflowService | undefined;

  private lastRun: TaskRun | null = null;
  private history: TaskRun[] = [];
  private readonly activityLogger = ActivityLogger.getInstance();

  private constructor() {
    this.lastRun = persistentState.get('taskWorkflow') ?? null;
    this.history = persistentState.get('taskWorkflowHistory') ?? [];
  }

  static getInstance(): TaskWorkflowService {
    if (!TaskWorkflowService.instance) {
      TaskWorkflowService.instance = new TaskWorkflowService();
    }
    return TaskWorkflowService.instance;
  }

  start(goal: string): TaskRun {
    const now = new Date().toISOString();
    const run: TaskRun = {
      id: `task-${Date.now().toString(36)}`,
      traceId: `trace-${Date.now().toString(36)}`,
      goal,
      createdAt: now,
      updatedAt: now,
      status: 'submitted',
      phases: DEFAULT_PHASES,
    };
    this.lastRun = run;
    this.recordHistory(run);
    this.activityLogger.logConsole({
      type: 'log',
      content: `[task] started ${run.id} (${run.traceId})`,
    });
    this.persist();
    return run;
  }

  getStatus(): TaskRun | null {
    return this.lastRun;
  }

  getHistory(): readonly TaskRun[] {
    return [...this.history].reverse();
  }

  resetForTesting(): void {
    this.lastRun = null;
    this.history = [];
    this.persist();
  }

  cancel(): TaskRun | null {
    if (!this.lastRun) {
      return null;
    }

    const now = new Date().toISOString();
    this.lastRun = {
      ...this.lastRun,
      status: 'cancelled',
      updatedAt: now,
    };
    this.recordHistory(this.lastRun);
    this.activityLogger.logConsole({
      type: 'log',
      content: `[task] cancelled ${this.lastRun.id} (${this.lastRun.traceId})`,
    });
    this.persist();
    return this.lastRun;
  }

  resume(): TaskRun | null {
    if (!this.lastRun) {
      return null;
    }
    const now = new Date().toISOString();
    this.lastRun = {
      ...this.lastRun,
      status: 'submitted',
      updatedAt: now,
    };
    this.recordHistory(this.lastRun);
    this.activityLogger.logConsole({
      type: 'log',
      content: `[task] resumed ${this.lastRun.id} (${this.lastRun.traceId})`,
    });
    this.persist();
    return this.lastRun;
  }

  clear(): void {
    this.lastRun = null;
    this.activityLogger.logConsole({
      type: 'log',
      content: '[task] cleared active task state',
    });
    this.persist();
  }

  private persist(): void {
    persistentState.set('taskWorkflow', this.lastRun);
    persistentState.set('taskWorkflowHistory', this.history);
  }

  private recordHistory(run: TaskRun): void {
    this.history.push(run);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(this.history.length - MAX_HISTORY);
    }
  }
}
