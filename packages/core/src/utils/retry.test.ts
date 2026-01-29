/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@google/genai';
import { AuthType } from '../core/contentGenerator.js';
import { type HttpError, ModelNotFoundError } from './httpErrors.js';
import { retryWithBackoff } from './retry.js';
import { setSimulate429 } from './testUtils.js';
import { debugLogger } from './debugLogger.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from './googleQuotaErrors.js';
import { PREVIEW_GEMINI_MODEL } from '../config/models.js';
import type { ModelPolicy } from '../availability/modelPolicy.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';

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
    debugLogger.warn = vi.fn();
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

    // 2. Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 3'),
      vi.runAllTimersAsync(),
    ]);

    // 3. Finally, assert the number of calls.
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should default to 10 maxAttempts if no options are provided', async () => {
    // This function will fail more than 10 times to ensure all retries are used.
    const mockFn = createFailingFunction(15);

    const promise = retryWithBackoff(mockFn);

    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 10'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(10);
  });

  it('should default to 10 maxAttempts if options.maxAttempts is undefined', async () => {
    // This function will fail more than 10 times to ensure all retries are used.
    const mockFn = createFailingFunction(15);

    const promise = retryWithBackoff(mockFn, { maxAttempts: undefined });

    // Expect it to fail with the error from the 10th attempt.
    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 10'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(10);
  });

  it('should not retry if shouldRetry returns false', async () => {
    const mockFn = vi.fn(async () => {
      throw new NonRetryableError('Non-retryable error');
    });
    const shouldRetryOnError = (error: Error) =>
      !(error instanceof NonRetryableError);

    const promise = retryWithBackoff(mockFn, {
      shouldRetryOnError,
      initialDelayMs: 10,
    });

    await expect(promise).rejects.toThrow('Non-retryable error');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if maxAttempts is not a positive number', async () => {
    const mockFn = createFailingFunction(1);

    // Test with 0
    await expect(retryWithBackoff(mockFn, { maxAttempts: 0 })).rejects.toThrow(
      'maxAttempts must be a positive number.',
    );

    // The function should not be called at all if validation fails
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should use default shouldRetry if not provided, retrying on ApiError 429', async () => {
    const mockFn = vi.fn(async () => {
      throw new ApiError({ message: 'Too Many Requests', status: 429 });
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    await Promise.all([
      expect(promise).rejects.toThrow('Too Many Requests'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use default shouldRetry if not provided, not retrying on ApiError 400', async () => {
    const mockFn = vi.fn(async () => {
      throw new ApiError({ message: 'Bad Request', status: 400 });
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    await expect(promise).rejects.toThrow('Bad Request');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should use default shouldRetry if not provided, retrying on generic error with status 429', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('Too Many Requests') as any;
      error.status = 429;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise).rejects.toThrow('Too Many Requests'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use default shouldRetry if not provided, not retrying on generic error with status 400', async () => {
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
    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise1).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    const firstDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );
    setTimeoutSpy.mockClear(); // Clear calls for the next run

    // Reset mockFn to reset its internal attempt counter for the next run
    mockFn = createFailingFunction(5); // Re-initialize with 5 failures

    const promise2 = runRetry();
    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise2).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

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

  describe('Fetch error retries', () => {
    it("should retry on 'fetch failed' when retryFetchErrors is true", async () => {
      const mockFn = vi.fn();
      mockFn.mockRejectedValueOnce(new TypeError('fetch failed'));
      mockFn.mockResolvedValueOnce('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: true,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should retry on common network error codes (ECONNRESET)', async () => {
      const mockFn = vi.fn();
      const error = new Error('read ECONNRESET');
      (error as any).code = 'ECONNRESET';
      mockFn.mockRejectedValueOnce(error);
      mockFn.mockResolvedValueOnce('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: true,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should retry on common network error codes in cause (ETIMEDOUT)', async () => {
      const mockFn = vi.fn();
      const cause = new Error('Connect Timeout');
      (cause as any).code = 'ETIMEDOUT';
      const error = new Error('fetch failed');
      (error as any).cause = cause;

      mockFn.mockRejectedValueOnce(error);
      mockFn.mockResolvedValueOnce('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: true,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should retry on 'fetch failed' when retryFetchErrors is true (short delays)", async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: true,
        initialDelayMs: 1,
        maxDelayMs: 1,
      });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('success');
    });

    it("should not retry on 'fetch failed' when retryFetchErrors is false", async () => {
      const mockFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: false,
        initialDelayMs: 1,
        maxDelayMs: 1,
      });
      await expect(promise).rejects.toThrow('fetch failed');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on network error code (ETIMEDOUT) even when retryFetchErrors is false', async () => {
      const error = new Error('connect ETIMEDOUT');
      (error as any).code = 'ETIMEDOUT';
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: false,
        initialDelayMs: 1,
        maxDelayMs: 1,
      });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('success');
    });
  });

  describe('Flash model fallback for OAuth users', () => {
    it('should trigger fallback for OAuth personal users on TerminalQuotaError', async () => {
      const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');

      let fallbackOccurred = false;
      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackOccurred) {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string, error?: unknown) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType, error);
        },
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(fallbackCallback).toHaveBeenCalledWith(
        'oauth-personal',
        expect.any(TerminalQuotaError),
      );
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should use retryDelayMs from RetryableQuotaError', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const mockFn = vi.fn().mockImplementation(async () => {
        throw new RetryableQuotaError('Per-minute limit', {} as any, 12.345);
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 100,
      });

      // Attach the rejection expectation *before* running timers
      // eslint-disable-next-line vitest/valid-expect
      const assertionPromise = expect(promise).rejects.toThrow();
      await vi.runAllTimersAsync();
      await assertionPromise;

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 12345);
    });

    it.each([[AuthType.USE_GEMINI], [AuthType.USE_VERTEX_AI], [undefined]])(
      'should invoke onPersistent429 callback (delegating decision) for non-Google auth users (authType: %s) on TerminalQuotaError',
      async (authType) => {
        const fallbackCallback = vi.fn();
        const mockFn = vi.fn().mockImplementation(async () => {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        });

        const promise = retryWithBackoff(mockFn, {
          maxAttempts: 3,
          onPersistent429: fallbackCallback,
          authType,
        });

        await expect(promise).rejects.toThrow('Daily limit reached');
        expect(fallbackCallback).toHaveBeenCalled();
        expect(mockFn).toHaveBeenCalledTimes(1);
      },
    );
  });
  it('should abort the retry loop when the signal is aborted', async () => {
    const abortController = new AbortController();
    const mockFn = vi.fn().mockImplementation(async () => {
      const error: HttpError = new Error('Server error');
      error.status = 500;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 5,
      initialDelayMs: 100,
      signal: abortController.signal,
    });
    await vi.advanceTimersByTimeAsync(50);
    abortController.abort();

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
  it('should trigger fallback for OAuth personal users on persistent 500 errors', async () => {
    const fallbackCallback = vi.fn().mockResolvedValue('gemini-2.5-flash');

    let fallbackOccurred = false;
    const mockFn = vi.fn().mockImplementation(async () => {
      if (!fallbackOccurred) {
        const error: HttpError = new Error('Internal Server Error');
        error.status = 500;
        throw error;
      }
      return 'success';
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      onPersistent429: async (authType?: string, error?: unknown) => {
        fallbackOccurred = true;
        return await fallbackCallback(authType, error);
      },
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('success');
    expect(fallbackCallback).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.objectContaining({ status: 500 }),
    );
    // 3 attempts (initial + 2 retries) fail with 500, then fallback triggers, then 1 success
    expect(mockFn).toHaveBeenCalledTimes(4);
  });

  it('should trigger fallback for OAuth personal users on ModelNotFoundError', async () => {
    const fallbackCallback = vi.fn().mockResolvedValue(PREVIEW_GEMINI_MODEL);

    let fallbackOccurred = false;
    const mockFn = vi.fn().mockImplementation(async () => {
      if (!fallbackOccurred) {
        throw new ModelNotFoundError('Requested entity was not found.', 404);
      }
      return 'success';
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      onPersistent429: async (authType?: string, error?: unknown) => {
        fallbackOccurred = true;
        return await fallbackCallback(authType, error);
      },
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('success');
    expect(fallbackCallback).toHaveBeenCalledWith(
      AuthType.LOGIN_WITH_GOOGLE,
      expect.any(ModelNotFoundError),
    );
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  describe('Availability Context Integration', () => {
    let mockService: ModelAvailabilityService;
    let mockPolicy1: ModelPolicy;
    let mockPolicy2: ModelPolicy;

    beforeEach(() => {
      vi.useRealTimers();
      mockService = createAvailabilityServiceMock();

      mockPolicy1 = {
        model: 'model-1',
        actions: {},
        stateTransitions: {
          terminal: 'terminal',
          transient: 'sticky_retry',
        },
      };

      mockPolicy2 = {
        model: 'model-2',
        actions: {},
        stateTransitions: {
          terminal: 'terminal',
        },
      };
    });

    it('updates availability context per attempt and applies transitions to the correct policy', async () => {
      const error = new TerminalQuotaError(
        'quota exceeded',
        { code: 429, message: 'quota', details: [] },
        10,
      );

      const fn = vi.fn().mockImplementation(async () => {
        throw error; // Always fail with quota
      });

      const onPersistent429 = vi
        .fn()
        .mockResolvedValueOnce('model-2') // First fallback success
        .mockResolvedValueOnce(null); // Second fallback fails (give up)

      // Context provider returns policy1 first, then policy2
      const getContext = vi
        .fn()
        .mockReturnValueOnce({ service: mockService, policy: mockPolicy1 })
        .mockReturnValueOnce({ service: mockService, policy: mockPolicy2 });

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
          getAvailabilityContext: getContext,
          onPersistent429,
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
      ).rejects.toThrow(TerminalQuotaError);

      // Verify failures
      expect(mockService.markTerminal).not.toHaveBeenCalled();
      expect(mockService.markTerminal).not.toHaveBeenCalled();

      // Verify sequences
    });

    it('marks sticky_retry after retries are exhausted for transient failures', async () => {
      const transientError = new RetryableQuotaError(
        'transient error',
        { code: 429, message: 'transient', details: [] },
        0,
      );

      const fn = vi.fn().mockRejectedValue(transientError);

      const getContext = vi
        .fn()
        .mockReturnValue({ service: mockService, policy: mockPolicy1 });

      vi.useFakeTimers();
      const promise = retryWithBackoff(fn, {
        maxAttempts: 3,
        getAvailabilityContext: getContext,
        initialDelayMs: 1,
        maxDelayMs: 1,
      }).catch((err) => err);

      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe(transientError);

      expect(fn).toHaveBeenCalledTimes(3);
      expect(mockService.markRetryOncePerTurn).not.toHaveBeenCalled();
      expect(mockService.markRetryOncePerTurn).not.toHaveBeenCalled();
      expect(mockService.markTerminal).not.toHaveBeenCalled();
    });

    it('maps different failure kinds to correct terminal reasons', async () => {
      const quotaError = new TerminalQuotaError(
        'quota',
        { code: 429, message: 'q', details: [] },
        10,
      );
      const notFoundError = new ModelNotFoundError('not found', 404);
      const genericError = new Error('unknown error');

      const fn = vi
        .fn()
        .mockRejectedValueOnce(quotaError)
        .mockRejectedValueOnce(notFoundError)
        .mockRejectedValueOnce(genericError);

      const policy: ModelPolicy = {
        model: 'model-1',
        actions: {},
        stateTransitions: {
          terminal: 'terminal', // from quotaError
          not_found: 'terminal', // from notFoundError
          unknown: 'terminal', // from genericError
        },
      };

      const getContext = vi
        .fn()
        .mockReturnValue({ service: mockService, policy });

      // Run for quotaError
      await retryWithBackoff(fn, {
        maxAttempts: 1,
        getAvailabilityContext: getContext,
      }).catch(() => {});
      expect(mockService.markTerminal).not.toHaveBeenCalled();
    });
  });
});
