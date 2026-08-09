/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { delay } from './delay.js';

describe('abortableDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves after the specified duration without a signal', async () => {
    const promise = delay(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves when a non-aborted signal is provided', async () => {
    const controller = new AbortController();
    const promise = delay(200, controller.signal);

    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(delay(50, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Aborted',
    });
  });

  it('rejects if the signal aborts while waiting', async () => {
    const controller = new AbortController();
    const promise = delay(500, controller.signal);

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Aborted',
    });
  });

  it('cleans up signal listeners after resolving', async () => {
    const removeEventListener = vi.fn();
    const mockSignal = {
      aborted: false,
      addEventListener: vi
        .fn()
        .mockImplementation((_type: string, listener: () => void) => {
          mockSignal.__listener = listener;
        }),
      removeEventListener,
      __listener: undefined as (() => void) | undefined,
    } as unknown as AbortSignal & { __listener?: () => void };

    const promise = delay(150, mockSignal);
    await vi.advanceTimersByTimeAsync(150);
    await promise;

    expect(mockSignal.addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener.mock.calls[0][1]).toBe(mockSignal.__listener);
  });

  // Technically unnecessary due to `onceTrue` but good sanity check
  it('cleans up signal listeners when aborted before completion', async () => {
    const controller = new AbortController();
    const removeEventListenerSpy = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );

    const promise = delay(400, controller.signal);

    await vi.advanceTimersByTimeAsync(50);
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
  });

  it('cleans up timeout when aborted before completion', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const controller = new AbortController();
    const promise = delay(400, controller.signal);

    await vi.advanceTimersByTimeAsync(50);
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
