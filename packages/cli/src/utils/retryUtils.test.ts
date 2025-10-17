/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from './retryUtils.js';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on network error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, { logRetries: false });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on timeout error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, { logRetries: false });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on HTTP 5xx errors', async () => {
    const error503 = { status: 503 };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error503)
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, { logRetries: false });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-network errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid input'));

    const promise = retryWithBackoff(fn, { logRetries: false });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Invalid input');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      logRetries: false,
    });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Network error');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should use exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      initialDelay: 100,
      backoffMultiplier: 2,
      logRetries: false,
    });

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second attempt after 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Third attempt after 200ms (100 * 2)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should respect maxDelay', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      initialDelay: 100,
      maxDelay: 150,
      backoffMultiplier: 3,
      logRetries: false,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second attempt after 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Third attempt capped at maxDelay (150ms instead of 300ms)
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should use custom isRetryable function', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Custom error'));

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      logRetries: false,
      isRetryable: (error) =>
        error instanceof Error && error.message === 'Custom error',
    });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Custom error');
    expect(fn).toHaveBeenCalledTimes(3); // Should retry because isRetryable returns true
  });
});
