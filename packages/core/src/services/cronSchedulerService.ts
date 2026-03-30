/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export interface ScheduledTask {
  id: string;
  intervalMs: number | null; // null if one-shot (though this basic implementation focuses on recurring)
  prompt: string;
  createdAt: number;
  nextRunAt: number;
  isRecurring: boolean;
}

export class CronSchedulerService extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map();
  private tickInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
  }

  /**
   * Starts the background interval that checks for due tasks.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickInterval = setInterval(() => this.tick(), 1000);
    // Don't prevent process exit if only the scheduler is running
    this.tickInterval.unref();
  }

  /**
   * Stops the background interval.
   */
  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Schedules a new task.
   * @param intervalString An interval string like "5m", "10s", "2h".
   * @param prompt The prompt to execute.
   * @param isRecurring Whether it's a recurring task or one-shot.
   * @returns The generated task ID.
   */
  scheduleTask(
    intervalString: string,
    prompt: string,
    isRecurring: boolean = true,
  ): string {
    const intervalMs = this.parseInterval(intervalString);
    if (!intervalMs) {
      throw new Error(
        `Invalid interval format: ${intervalString}. Supported formats: 10s, 5m, 2h.`,
      );
    }

    const id = Math.random().toString(36).substring(2, 10); // 8-character ID
    const now = Date.now();

    const task: ScheduledTask = {
      id,
      intervalMs,
      prompt,
      createdAt: now,
      nextRunAt: now + intervalMs,
      isRecurring,
    };

    this.tasks.set(id, task);

    if (!this.isRunning) {
      this.start();
    }

    return id;
  }

  /**
   * Lists all active scheduled tasks.
   */
  listTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Cancels a scheduled task by ID.
   */
  cancelTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  private tick() {
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (now >= task.nextRunAt) {
        // Emit the event so the REPL can pick it up
        this.emit('task_due', task);

        if (task.isRecurring && task.intervalMs) {
          // Calculate next run time
          task.nextRunAt = now + task.intervalMs;
        } else {
          // One-shot, remove it
          this.tasks.delete(id);
        }
      }
    }

    // Auto-stop if no tasks
    if (this.tasks.size === 0) {
      this.stop();
    }
  }

  /**
   * Parses strings like "10s", "5m", "2h", "1d" into milliseconds.
   */
  private parseInterval(interval: string): number | null {
    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }
}

// Singleton instance
export const cronSchedulerService = new CronSchedulerService();
