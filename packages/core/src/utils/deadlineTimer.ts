/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A utility that manages a timeout and an AbortController, allowing the
 * timeout to be paused, resumed, and dynamically extended.
 */
export class DeadlineTimer {
  private readonly controller: AbortController;
  private timeoutId: NodeJS.Timeout | null = null;
  private remainingMs: number;
  private lastStartedAt: number;
  private isPaused = false;

  constructor(timeoutMs: number, reason = 'Timeout exceeded.') {
    this.controller = new AbortController();
    this.remainingMs = timeoutMs;
    this.lastStartedAt = Date.now();
    this.schedule(timeoutMs, reason);
  }

  /** The AbortSignal managed by this timer. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Pauses the timer, clearing any active timeout.
   */
  pause(): void {
    if (this.isPaused || this.controller.signal.aborted) return;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const elapsed = Date.now() - this.lastStartedAt;
    this.remainingMs = Math.max(0, this.remainingMs - elapsed);
    this.isPaused = true;
  }

  /**
   * Resumes the timer with the remaining budget.
   */
  resume(reason = 'Timeout exceeded.'): void {
    if (!this.isPaused || this.controller.signal.aborted) return;

    this.lastStartedAt = Date.now();
    this.schedule(this.remainingMs, reason);
    this.isPaused = false;
  }

  /**
   * Extends the current budget by the specified number of milliseconds.
   */
  extend(ms: number, reason = 'Timeout exceeded.'): void {
    if (this.controller.signal.aborted) return;

    if (this.isPaused) {
      this.remainingMs += ms;
    } else {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      const elapsed = Date.now() - this.lastStartedAt;
      this.remainingMs = Math.max(0, this.remainingMs - elapsed) + ms;
      this.lastStartedAt = Date.now();
      this.schedule(this.remainingMs, reason);
    }
  }

  /**
   * Aborts the signal immediately and clears any pending timers.
   */
  abort(reason?: unknown): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isPaused = false;
    this.controller.abort(reason);
  }

  private schedule(ms: number, reason: string): void {
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.controller.abort(new Error(reason));
    }, ms);
  }
}
