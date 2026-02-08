/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeadlineTimer } from './deadlineTimer.js';

describe('DeadlineTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should abort when timeout is reached', () => {
    const timer = new DeadlineTimer(1000);
    const signal = timer.signal;
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(Error);
    expect((signal.reason as Error).message).toBe('Timeout exceeded.');
  });

  it('should allow extending the deadline', () => {
    const timer = new DeadlineTimer(1000);
    const signal = timer.signal;

    vi.advanceTimersByTime(500);
    expect(signal.aborted).toBe(false);

    timer.extend(1000); // New deadline is 1000 + 1000 = 2000 from start

    vi.advanceTimersByTime(600); // 1100 total
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(900); // 2000 total
    expect(signal.aborted).toBe(true);
  });

  it('should allow pausing and resuming the timer', () => {
    const timer = new DeadlineTimer(1000);
    const signal = timer.signal;

    vi.advanceTimersByTime(500);
    timer.pause();

    vi.advanceTimersByTime(2000); // Wait a long time while paused
    expect(signal.aborted).toBe(false);

    timer.resume();
    vi.advanceTimersByTime(400);
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(200); // Total active time 500 + 400 + 200 = 1100
    expect(signal.aborted).toBe(true);
  });

  it('should abort immediately when abort() is called', () => {
    const timer = new DeadlineTimer(1000);
    const signal = timer.signal;

    timer.abort('cancelled');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('cancelled');
  });

  it('should not fire timeout if aborted manually', () => {
    const timer = new DeadlineTimer(1000);
    const signal = timer.signal;

    timer.abort();
    vi.advanceTimersByTime(1000);
    // Already aborted, but shouldn't re-abort or throw
    expect(signal.aborted).toBe(true);
  });
});
