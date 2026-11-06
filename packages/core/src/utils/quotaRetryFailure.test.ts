/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from './retry.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from './googleQuotaErrors.js';
import { debugLogger } from './debugLogger.js';

describe('Issue #29805: Quota-exhausted 429 retried for hours', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    debugLogger.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should not silently retry a quota exhaustion error with a 16-hour reset delay in unattended/ACP mode', async () => {
    const quotaError = new TerminalQuotaError(
      'You have exhausted your capacity on this model. Your quota will reset after 16h03m18s.',
      {
        code: 429,
        message:
          'You have exhausted your capacity on this model. Your quota will reset after 16h03m18s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'QUOTA_EXHAUSTED',
            domain: 'cloudcode-pa.googleapis.com',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '57798s',
          },
        ],
      },
      57798, // 57,798 seconds = ~16 hours
      'QUOTA_EXHAUSTED',
    );

    const failingFn = vi.fn().mockRejectedValue(quotaError);
    let retryAttemptEmitted = false;
    let scheduledRetryDelayMs = 0;

    const promise = retryWithBackoff(failingFn, {
      maxAttempts: 3,
      maxDelayMs: 30000, // 30 seconds max delay
      onPersistent429: undefined, // unattended / ACP mode (no fallback handler)
      onRetry: (_attempt, _error, delayMs) => {
        retryAttemptEmitted = true;
        scheduledRetryDelayMs = delayMs;
      },
    });

    // Run pending timers and await rejection expectation in parallel
    await Promise.all([
      expect(promise).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    // Verifications that fail on the unpatched codebase:
    // 1. Should not have scheduled a retry attempt
    expect(retryAttemptEmitted).toBe(false);
    // 2. Scheduled delay should never exceed maxDelayMs (30s), let alone 16 hours
    expect(scheduledRetryDelayMs).toBeLessThanOrEqual(30000);
    // 3. Should not have executed further retry attempts on the failing function
    expect(failingFn).toHaveBeenCalledTimes(1);
  });

  it('should immediately invoke onPersistent429 fallback without silent retries when quota is exhausted with a multi-hour delay in interactive mode', async () => {
    const quotaError = new TerminalQuotaError(
      'You have exhausted your capacity on this model. Your quota will reset after 16h03m18s.',
      {
        code: 429,
        message:
          'You have exhausted your capacity on this model. Your quota will reset after 16h03m18s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'QUOTA_EXHAUSTED',
            domain: 'cloudcode-pa.googleapis.com',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '57798s',
          },
        ],
      },
      57798,
      'QUOTA_EXHAUSTED',
    );

    const failingFn = vi.fn().mockRejectedValue(quotaError);
    const onPersistent429 = vi.fn().mockResolvedValue(null);
    let retryAttemptEmitted = false;

    const promise = retryWithBackoff(failingFn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onPersistent429,
      onRetry: () => {
        retryAttemptEmitted = true;
      },
    });

    await Promise.all([
      expect(promise).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    expect(retryAttemptEmitted).toBe(false);
    expect(onPersistent429).toHaveBeenCalledTimes(1);
    expect(failingFn).toHaveBeenCalledTimes(1);
  });

  it('should not retry unstructured error message indicating quota reset after some duration', async () => {
    const unstructuredQuotaError = new TerminalQuotaError(
      'You have exhausted your capacity on this model. Your quota will reset after 14h31m.',
    );

    const failingFn = vi.fn().mockRejectedValue(unstructuredQuotaError);
    let retryAttemptEmitted = false;

    const promise = retryWithBackoff(failingFn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onPersistent429: undefined,
      onRetry: () => {
        retryAttemptEmitted = true;
      },
    });

    await Promise.all([
      expect(promise).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    expect(retryAttemptEmitted).toBe(false);
    expect(failingFn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately when a RetryableQuotaError specifies a retryDelayMs exceeding maxDelayMs', async () => {
    const delayOverMaxError = new RetryableQuotaError(
      'Rate limit exceeded. Please retry later.',
      undefined,
      600, // 600s = 10 minutes, when maxDelayMs is 30s
    );

    const failingFn = vi.fn().mockRejectedValue(delayOverMaxError);
    let retryAttemptEmitted = false;

    const promise = retryWithBackoff(failingFn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onRetry: () => {
        retryAttemptEmitted = true;
      },
    });

    await Promise.all([
      expect(promise).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    expect(retryAttemptEmitted).toBe(false);
    expect(failingFn).toHaveBeenCalledTimes(1);
  });

  it('should still retry genuine transient capacity errors with short delay in unattended mode', async () => {
    const transientCapacityError = new TerminalQuotaError(
      'The model is temporarily overloaded. MODEL_CAPACITY_EXHAUSTED',
      {
        code: 429,
        message: 'MODEL_CAPACITY_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'MODEL_CAPACITY_EXHAUSTED',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '2s',
          },
        ],
      },
      2,
      'MODEL_CAPACITY_EXHAUSTED',
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientCapacityError)
      .mockResolvedValue('recovered');

    let retryDelayRecorded = 0;
    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onPersistent429: undefined,
      onRetry: (_attempt, _error, delayMs) => {
        retryDelayRecorded = delayMs;
      },
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retryDelayRecorded).toBeGreaterThanOrEqual(2000);
    expect(retryDelayRecorded).toBeLessThanOrEqual(2400);
  });

  it('should retry transient QUOTA_EXHAUSTED errors when a short delay is provided', async () => {
    const transientQuotaError = new TerminalQuotaError(
      'Resource exhausted (QUOTA_EXHAUSTED)',
      {
        code: 429,
        message: 'QUOTA_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'QUOTA_EXHAUSTED',
            domain: 'cloudcode-pa.googleapis.com',
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '3s',
          },
        ],
      },
      3,
      'QUOTA_EXHAUSTED',
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientQuotaError)
      .mockResolvedValue('recovered-from-quota');

    let retryDelayRecorded = 0;
    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onPersistent429: undefined,
      onRetry: (_attempt, _error, delayMs) => {
        retryDelayRecorded = delayMs;
      },
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('recovered-from-quota');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retryDelayRecorded).toBeGreaterThanOrEqual(3000);
    expect(retryDelayRecorded).toBeLessThanOrEqual(3600);
  });

  it('should retry errors with "quota will reset after" message when a short delay is provided', async () => {
    const shortResetError = new TerminalQuotaError(
      'Your quota will reset after 5s.',
      {
        code: 429,
        message: 'Your quota will reset after 5s.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '5s',
          },
        ],
      },
      5,
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(shortResetError)
      .mockResolvedValue('recovered-from-reset');

    let retryDelayRecorded = 0;
    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      maxDelayMs: 30000,
      onPersistent429: undefined,
      onRetry: (_attempt, _error, delayMs) => {
        retryDelayRecorded = delayMs;
      },
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('recovered-from-reset');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retryDelayRecorded).toBeGreaterThanOrEqual(5000);
    expect(retryDelayRecorded).toBeLessThanOrEqual(6000);
  });
});
