/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, HttpError } from './retry.js';
import { setSimulate429 } from './testUtils.js';

// Helper to create a mock function that fails a certain number of times
const createFailingFunction = (
  failures: number,
  successValue: string = 'success',
) => {
  let attempts = 0;
  return vi.fn(async () => {
    attempts++;
    if (attempts <= failures) {
      // Simulate a retryable error
      const error: HttpError = new Error(`Simulated error attempt ${attempts}`);
      error.status = 500; // Simulate a server error
      throw error;
    }
    return successValue;
  });
};

// Custom error for testing non-retryable conditions
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Disable 429 simulation for tests
    setSimulate429(false);
    // Suppress unhandled promise rejection warnings for tests that expect errors
    console.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return the result on the first attempt if successful', async () => {
    const mockFn = createFailingFunction(0);
    const result = await retryWithBackoff(mockFn);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed if failures are within maxAttempts', async () => {
    const mockFn = createFailingFunction(2);
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    await vi.runAllTimersAsync(); // Ensure all delays and retries complete

    const result = await promise;
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if all attempts fail', async () => {
    const mockFn = createFailingFunction(3);

    // 1. Start the retryable operation, which returns a promise.
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    // 2. IMPORTANT: Attach the rejection expectation to the promise *immediately*.
    //    This ensures a 'catch' handler is present before the promise can reject.
    //    The result is a new promise that resolves when the assertion is met.
    const assertionPromise = expect(promise).rejects.toThrow(
      'Simulated error attempt 3',
    );

    // 3. Now, advance the timers. This will trigger the retries and the
    //    eventual rejection. The handler attached in step 2 will catch it.
    await vi.runAllTimersAsync();

    // 4. Await the assertion promise itself to ensure the test was successful.
    await assertionPromise;

    // 5. Finally, assert the number of calls.
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if shouldRetry returns false', async () => {
    const mockFn = vi.fn(async () => {
      throw new NonRetryableError('Non-retryable error');
    });
    const shouldRetry = (error: Error) => !(error instanceof NonRetryableError);

    const promise = retryWithBackoff(mockFn, {
      shouldRetry,
      initialDelayMs: 10,
    });

    await expect(promise).rejects.toThrow('Non-retryable error');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should use default shouldRetry if not provided, retrying on 429', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('Too Many Requests') as any;
      error.status = 429;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    // Attach the rejection expectation *before* running timers
    const assertionPromise =
      expect(promise).rejects.toThrow('Too Many Requests');

    // Run timers to trigger retries and eventual rejection
    await vi.runAllTimersAsync();

    // Await the assertion
    await assertionPromise;

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use default shouldRetry if not provided, not retrying on 400', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('Bad Request') as any;
      error.status = 400;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    await expect(promise).rejects.toThrow('Bad Request');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxDelayMs', async () => {
    const mockFn = createFailingFunction(3);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 250, // Max delay is less than 100 * 2 * 2 = 400
    });

    await vi.advanceTimersByTimeAsync(1000); // Advance well past all delays
    await promise;

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1] as number);

    // Delays should be around initial, initial*2, maxDelay (due to cap)
    // Jitter makes exact assertion hard, so we check ranges / caps
    expect(delays.length).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(100 * 0.7);
    expect(delays[0]).toBeLessThanOrEqual(100 * 1.3);
    expect(delays[1]).toBeGreaterThanOrEqual(200 * 0.7);
    expect(delays[1]).toBeLessThanOrEqual(200 * 1.3);
    // The third delay should be capped by maxDelayMs (250ms), accounting for jitter
    expect(delays[2]).toBeGreaterThanOrEqual(250 * 0.7);
    expect(delays[2]).toBeLessThanOrEqual(250 * 1.3);
  });

  it('should handle jitter correctly, ensuring varied delays', async () => {
    let mockFn = createFailingFunction(5);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    // Run retryWithBackoff multiple times to observe jitter
    const runRetry = () =>
      retryWithBackoff(mockFn, {
        maxAttempts: 2, // Only one retry, so one delay
        initialDelayMs: 100,
        maxDelayMs: 1000,
      });

    // We expect rejections as mockFn fails 5 times
    const promise1 = runRetry();
    // Attach the rejection expectation *before* running timers
    const assertionPromise1 = expect(promise1).rejects.toThrow();
    await vi.runAllTimersAsync(); // Advance for the delay in the first runRetry
    await assertionPromise1;

    const firstDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );
    setTimeoutSpy.mockClear(); // Clear calls for the next run

    // Reset mockFn to reset its internal attempt counter for the next run
    mockFn = createFailingFunction(5); // Re-initialize with 5 failures

    const promise2 = runRetry();
    // Attach the rejection expectation *before* running timers
    const assertionPromise2 = expect(promise2).rejects.toThrow();
    await vi.runAllTimersAsync(); // Advance for the delay in the second runRetry
    await assertionPromise2;

    const secondDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );

    // Check that the delays are not exactly the same due to jitter
    // This is a probabilistic test, but with +/-30% jitter, it's highly likely they differ.
    if (firstDelaySet.length > 0 && secondDelaySet.length > 0) {
      // Check the first delay of each set
      expect(firstDelaySet[0]).not.toBe(secondDelaySet[0]);
    } else {
      // If somehow no delays were captured (e.g. test setup issue), fail explicitly
      throw new Error('Delays were not captured for jitter test');
    }

    // Ensure delays are within the expected jitter range [70, 130] for initialDelayMs = 100
    [...firstDelaySet, ...secondDelaySet].forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(100 * 0.7);
      expect(d).toBeLessThanOrEqual(100 * 1.3);
    });
  });

  describe('Flash model fallback for OAuth users', () => {
    it('should trigger fallback for OAuth personal users after persistent 429 errors', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');

      let fallbackOccurred = false;
      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackOccurred) {
          const error: HttpError = new Error('Rate limit exceeded');
          error.status = 429;
          throw error;
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType);
        },
        authType: 'oauth-personal',
      });

      // Advance all timers to complete retries
      await vi.runAllTimersAsync();

      // Should succeed after fallback
      await expect(promise).resolves.toBe('success');

      // Verify callback was called with correct auth type
      expect(fallbackCallback).toHaveBeenCalledWith('oauth-personal');

      // Should retry again after fallback
      expect(mockFn).toHaveBeenCalledTimes(3); // 2 initial attempts + 1 after fallback
    });

    it('should NOT trigger fallback for API key users', async () => {
      const fallbackCallback = vi.fn();

      const mockFn = vi.fn(async () => {
        const error: HttpError = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'gemini-api-key',
      });

      // Handle the promise properly to avoid unhandled rejections
      const resultPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should fail after all retries without fallback
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Rate limit exceeded');

      // Callback should not be called for API key users
      expect(fallbackCallback).not.toHaveBeenCalled();
    });

    it('should reset attempt counter and continue after successful fallback', async () => {
      let fallbackCalled = false;
      const fallbackCallback = vi.fn().mockImplementation(async () => {
        fallbackCalled = true;
        return 'gemini-2.5-flash';
      });

      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackCalled) {
          const error: HttpError = new Error('Rate limit exceeded');
          error.status = 429;
          throw error;
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(fallbackCallback).toHaveBeenCalledOnce();
    });

    it('should continue with original error if fallback is rejected', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue(null); // User rejected fallback

      const mockFn = vi.fn(async () => {
        const error: HttpError = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: fallbackCallback,
        authType: 'oauth-personal',
      });

      // Handle the promise properly to avoid unhandled rejections
      const resultPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Should fail with original error when fallback is rejected
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Rate limit exceeded');
      expect(fallbackCallback).toHaveBeenCalledWith(
        'oauth-personal',
        expect.any(Error),
      );
    });

    it('should handle mixed error types (only count consecutive 429s)', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');
      let attempts = 0;
      let fallbackOccurred = false;

      const mockFn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (fallbackOccurred) {
          return 'success';
        }
        if (attempts === 1) {
          // First attempt: 500 error (resets consecutive count)
          const error: HttpError = new Error('Server error');
          error.status = 500;
          throw error;
        } else {
          // Remaining attempts: 429 errors
          const error: HttpError = new Error('Rate limit exceeded');
          error.status = 429;
          throw error;
        }
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 5,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType);
        },
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');

      // Should trigger fallback after 2 consecutive 429s (attempts 2-3)
      expect(fallbackCallback).toHaveBeenCalledWith('oauth-personal');
    });
  });
});
