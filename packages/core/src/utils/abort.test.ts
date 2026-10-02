/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createTimeoutAbortHandle } from './abort.js';

describe('createTimeoutAbortHandle', () => {
  it('aborts after the timeout when the external signal does not', async () => {
    vi.useFakeTimers();
    try {
      const handle = createTimeoutAbortHandle(undefined, 1000);
      const abortPromise = new Promise<void>((resolve) => {
        handle.signal.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(handle.signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await abortPromise;
      expect(handle.signal.aborted).toBe(true);
      expect(handle.didTimeout()).toBe(true);

      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not abort before the timeout', () => {
    vi.useFakeTimers();
    try {
      const handle = createTimeoutAbortHandle(undefined, 1000);
      vi.advanceTimersByTime(999);
      expect(handle.signal.aborted).toBe(false);
      expect(handle.didTimeout()).toBe(false);
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts immediately when the external signal is already aborted', () => {
    const external = new AbortController();
    external.abort(new Error('user cancelled'));

    const handle = createTimeoutAbortHandle(external.signal, 1000);
    expect(handle.signal.aborted).toBe(true);
    expect(handle.didTimeout()).toBe(false);
    expect((handle.signal.reason as Error).message).toBe('user cancelled');

    handle.dispose();
  });

  it('aborts when the external signal aborts before the timeout', () => {
    const external = new AbortController();
    const handle = createTimeoutAbortHandle(external.signal, 1000);

    external.abort(new Error('user cancelled'));
    expect(handle.signal.aborted).toBe(true);
    expect(handle.didTimeout()).toBe(false);
    expect((handle.signal.reason as Error).message).toBe('user cancelled');

    handle.dispose();
  });

  it('stops the timer on dispose so it never fires afterwards', () => {
    vi.useFakeTimers();
    try {
      const handle = createTimeoutAbortHandle(undefined, 1000);
      handle.dispose();

      vi.advanceTimersByTime(5000);
      expect(handle.signal.aborted).toBe(false);
      expect(handle.didTimeout()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
