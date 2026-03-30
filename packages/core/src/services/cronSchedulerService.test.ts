/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CronSchedulerService,
  type ScheduledTask,
} from './cronSchedulerService.js';

describe('CronSchedulerService', () => {
  let service: CronSchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new CronSchedulerService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('should parse intervals and schedule a task', () => {
    const id = service.scheduleTask('5m', 'test prompt');
    const tasks = service.listTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].prompt).toBe('test prompt');
    expect(tasks[0].intervalMs).toBe(5 * 60 * 1000);
  });

  it('should throw on invalid interval', () => {
    expect(() => service.scheduleTask('invalid', 'test prompt')).toThrow(
      /Invalid interval format/,
    );
  });

  it('should emit event when task is due', () => {
    const callback = vi.fn();
    service.on('task_due', callback);

    service.scheduleTask('10s', 'test prompt');

    // Advance 9 seconds, shouldn't fire
    vi.advanceTimersByTime(9000);
    expect(callback).not.toHaveBeenCalled();

    // Advance 1 more second, should fire
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    const taskArg = callback.mock.calls[0][0] as ScheduledTask;
    expect(taskArg.prompt).toBe('test prompt');
  });

  it('should handle recurring tasks correctly', () => {
    const callback = vi.fn();
    service.on('task_due', callback);

    service.scheduleTask('10s', 'test prompt', true);

    // First run
    vi.advanceTimersByTime(10000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Second run
    vi.advanceTimersByTime(10000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle one-shot tasks correctly', () => {
    const callback = vi.fn();
    service.on('task_due', callback);

    service.scheduleTask('10s', 'test prompt', false);

    // First run
    vi.advanceTimersByTime(10000);
    expect(callback).toHaveBeenCalledTimes(1);

    expect(service.listTasks()).toHaveLength(0); // Task should be removed

    // Advance again, shouldn't fire
    vi.advanceTimersByTime(10000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should cancel a task', () => {
    const id = service.scheduleTask('10s', 'test prompt');
    expect(service.listTasks()).toHaveLength(1);

    service.cancelTask(id);
    expect(service.listTasks()).toHaveLength(0);
  });
});
