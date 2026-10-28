/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import {
  useLoadingIndicator,
  isRateLimitRetry,
} from './useLoadingIndicator.js';
import { StreamingState } from '../types.js';
import type { RetryAttemptPayload } from '@google/gemini-cli-core';

describe('useLoadingIndicator - 429 Rate Limit and Cool-Down Countdown UX', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.runOnlyPendingTimers);
    vi.restoreAllMocks();
  });

  const renderLoadingIndicatorHook = async (
    initialRetryStatus: RetryAttemptPayload | null,
    errorVerbosity: 'low' | 'full' = 'low',
    initialStreamingState: StreamingState = StreamingState.Responding,
    initialPauseUpdates: boolean = false,
  ) => {
    let hookResult: ReturnType<typeof useLoadingIndicator>;
    function TestComponent({
      retryStatus,
      verbosity,
      streamingState,
      pauseUpdates,
    }: {
      retryStatus: RetryAttemptPayload | null;
      verbosity: 'low' | 'full';
      streamingState: StreamingState;
      pauseUpdates: boolean;
    }) {
      hookResult = useLoadingIndicator({
        streamingState,
        shouldShowFocusHint: false,
        retryStatus,
        showTips: false,
        showWit: false,
        errorVerbosity: verbosity,
        pauseUpdates,
      });
      return null;
    }

    const { rerender, waitUntilReady } = await render(
      <TestComponent
        retryStatus={initialRetryStatus}
        verbosity={errorVerbosity}
        streamingState={initialStreamingState}
        pauseUpdates={initialPauseUpdates}
      />,
    );

    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: async (props: {
        retryStatus?: RetryAttemptPayload | null;
        streamingState?: StreamingState;
        pauseUpdates?: boolean;
        verbosity?: 'low' | 'full';
      }) => {
        rerender(
          <TestComponent
            retryStatus={
              props.retryStatus !== undefined
                ? props.retryStatus
                : initialRetryStatus
            }
            verbosity={props.verbosity ?? errorVerbosity}
            streamingState={props.streamingState ?? initialStreamingState}
            pauseUpdates={props.pauseUpdates ?? initialPauseUpdates}
          />,
        );
        await waitUntilReady();
      },
      waitUntilReady,
    };
  };

  it('Case 1: 429 Rate Limit in default low verbosity - surfaces on Attempt 1 with countdown', async () => {
    const rateLimitRetryStatus: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 5000, // 5 seconds
      error: '429 Rate limit exceeded: Resource has been exhausted',
      status: 429,
    };

    const { result } = await renderLoadingIndicatorHook(
      rateLimitRetryStatus,
      'low',
    );

    // Initial T=0s
    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 5s (Attempt 1/3)',
    );

    // T=1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 4s (Attempt 1/3)',
    );

    // T=2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 3s (Attempt 1/3)',
    );

    // T=3s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 2s (Attempt 1/3)',
    );

    // T=4s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 1s (Attempt 1/3)',
    );
  });

  it('Case 2: 429 Rate Limit in full verbosity - displays countdown and attempt details', async () => {
    const rateLimitRetryStatus: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 4000,
      error: 'QUOTA_EXCEEDED',
      status: 429,
    };

    const { result } = await renderLoadingIndicatorHook(
      rateLimitRetryStatus,
      'full',
    );

    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 4s (Attempt 1/3)',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 2s (Attempt 1/3)',
    );
  });

  it('Case 3: Multi-attempt progression - resets countdown cleanly on next attempt', async () => {
    const attempt1Status: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 3000,
      error: 'RESOURCE_EXHAUSTED',
      status: 429,
    };

    const { result, rerender } = await renderLoadingIndicatorHook(
      attempt1Status,
      'low',
    );

    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 3s (Attempt 1/3)',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 1s (Attempt 1/3)',
    );

    // Attempt 2 arrives with a larger backoff of 6s
    const attempt2Status: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 6000,
      error: 'RESOURCE_EXHAUSTED',
      status: 429,
    };

    await act(async () => {
      await rerender({ retryStatus: attempt2Status });
    });

    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 6s (Attempt 2/3)',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.currentLoadingPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 4s (Attempt 2/3)',
    );
  });

  it('Case 4: Non-rate-limit errors (e.g. 500 SERVER_ERROR) - preserves standard behavior', async () => {
    const serverErrorStatus: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 5000,
      error: 'SERVER_ERROR',
      status: 500,
    };

    // In low verbosity: Attempt 1 is suppressed
    const { result: lowResult, rerender: lowRerender } =
      await renderLoadingIndicatorHook(serverErrorStatus, 'low');

    expect(lowResult.current.statusPhrase).toBeUndefined();

    // In low verbosity: Attempt 2 shows generic hint
    const serverErrorAttempt2: RetryAttemptPayload = {
      ...serverErrorStatus,
      attempt: 2,
    };
    await act(async () => {
      await lowRerender({ retryStatus: serverErrorAttempt2 });
    });
    expect(lowResult.current.statusPhrase).toBe(
      "This is taking a bit longer, we're still on it.",
    );

    // In full verbosity: shows standard attempt string
    const { result: fullResult } = await renderLoadingIndicatorHook(
      serverErrorStatus,
      'full',
    );
    expect(fullResult.current.statusPhrase).toBe(
      'Trying to reach gemini-2.5-flash (Attempt 2/3)',
    );
  });

  it('Case 5: Manual abort / cancellation during backoff - stops timer and clears phrases', async () => {
    const rateLimitRetryStatus: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 10000,
      error: '429 Rate limit',
      status: 429,
    };

    const { result, rerender } = await renderLoadingIndicatorHook(
      rateLimitRetryStatus,
      'low',
      StreamingState.Responding,
    );

    expect(result.current.statusPhrase).toBe(
      'Rate limit reached. Cooling down... Retrying in 10s (Attempt 1/3)',
    );

    // User aborts: streamingState becomes Idle, retryStatus is cleared
    await act(async () => {
      await rerender({
        streamingState: StreamingState.Idle,
        retryStatus: null,
      });
    });

    expect(result.current.statusPhrase).toBeUndefined();
    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });

  it('Case 6: Pause updates toggle - pauses countdown and resumes without skipping time', async () => {
    const rateLimitRetryStatus: RetryAttemptPayload = {
      model: 'gemini-2.5-flash',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 8000,
      error: '429 Rate limit',
      status: 429,
    };

    const { result, rerender } = await renderLoadingIndicatorHook(
      rateLimitRetryStatus,
      'low',
      StreamingState.Responding,
      false,
    );

    expect(result.current.currentLoadingPhrase).toMatch(/8s/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.currentLoadingPhrase).toMatch(/6s/);

    await act(async () => {
      await rerender({ pauseUpdates: true });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.currentLoadingPhrase).toMatch(/6s/);

    await act(async () => {
      await rerender({ pauseUpdates: false });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.currentLoadingPhrase).toMatch(/4s/);
  });

  describe('isRateLimitRetry detection helper', () => {
    it('should detect rate limits by status code 429', () => {
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          status: 429,
        }),
      ).toBe(true);
    });

    it('should detect rate limits by error keywords', () => {
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          error: 'QUOTA_EXCEEDED',
        }),
      ).toBe(true);
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          error: 'RESOURCE_EXHAUSTED',
        }),
      ).toBe(true);
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          error: 'Rate limit reached, please retry',
        }),
      ).toBe(true);
    });

    it('should return false for non-rate-limit errors or null', () => {
      expect(isRateLimitRetry(null)).toBe(false);
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          error: 'SERVER_ERROR',
          status: 500,
        }),
      ).toBe(false);
      expect(
        isRateLimitRetry({
          model: 'm',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 1000,
          error: 'FETCH_FAILED',
        }),
      ).toBe(false);
    });
  });
});
