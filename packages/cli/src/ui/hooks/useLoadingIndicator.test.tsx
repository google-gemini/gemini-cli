/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useLoadingIndicator } from './useLoadingIndicator.js';
import { StreamingState } from '../types.js';
import {
  PHRASE_CHANGE_INTERVAL_MS,
  INTERACTIVE_SHELL_WAITING_PHRASE,
} from './usePhraseCycler.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import type { RetryAttemptPayload } from '@google/gemini-cli-core';

describe('useLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers after each test
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.runOnlyPendingTimers);
    vi.restoreAllMocks();
  });

  const renderLoadingIndicatorHook = async (
    initialStreamingState: StreamingState,
    initialShouldShowFocusHint: boolean = false,
    initialRetryStatus: RetryAttemptPayload | null = null,
    initialShowTips: boolean = true,
    initialShowWit: boolean = true,
    initialErrorVerbosity: 'low' | 'full' = 'full',
  ) => {
    let hookResult: ReturnType<typeof useLoadingIndicator>;
    function TestComponent({
      streamingState,
      shouldShowFocusHint,
      retryStatus,
      showTips,
      showWit,
      errorVerbosity,
    }: {
      streamingState: StreamingState;
      shouldShowFocusHint?: boolean;
      retryStatus?: RetryAttemptPayload | null;
      showTips?: boolean;
      showWit?: boolean;
      errorVerbosity?: 'low' | 'full';
    }) {
      hookResult = useLoadingIndicator({
        streamingState,
        shouldShowFocusHint: !!shouldShowFocusHint,
        retryStatus: retryStatus || null,
        showTips,
        showWit,
        errorVerbosity,
      });
      return null;
    }

    const { rerender, waitUntilReady } = await render(
      <TestComponent
        streamingState={initialStreamingState}
        shouldShowFocusHint={initialShouldShowFocusHint}
        retryStatus={initialRetryStatus}
        showTips={initialShowTips}
        showWit={initialShowWit}
        errorVerbosity={initialErrorVerbosity}
      />,
    );
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: async (newProps: {
        streamingState: StreamingState;
        shouldShowFocusHint?: boolean;
        retryStatus?: RetryAttemptPayload | null;
        showTips?: boolean;
        showWit?: boolean;
        errorVerbosity?: 'low' | 'full';
      }) => {
        rerender(
          <TestComponent
            showTips={initialShowTips}
            showWit={initialShowWit}
            errorVerbosity={initialErrorVerbosity}
            {...newProps}
          />,
        );
        await waitUntilReady();
      },
      waitUntilReady,
    };
  };

  it('should initialize with default values when Idle', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = await renderLoadingIndicatorHook(StreamingState.Idle);
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });

  it('should show interactive shell waiting phrase when shouldShowFocusHint is true', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result, rerender } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
    );

    await act(async () => {
      await rerender({
        streamingState: StreamingState.Responding,
        shouldShowFocusHint: true,
      });
    });

    expect(result.current.currentLoadingPhrase).toBe(
      INTERACTIVE_SHELL_WAITING_PHRASE,
    );
  });

  it('should reflect values when Responding', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    expect(result.current.elapsedTime).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 1);
    });

    // Both tip and witty phrase are available in the currentLoadingPhrase because it defaults to tip if present
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      result.current.currentLoadingPhrase,
    );
  });

  it('should show waiting phrase and retain elapsedTime when WaitingForConfirmation', async () => {
    const { result, rerender } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(result.current.elapsedTime).toBe(60);

    await act(async () => {
      await rerender({ streamingState: StreamingState.WaitingForConfirmation });
    });

    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );
    expect(result.current.elapsedTime).toBe(60); // Elapsed time should be retained

    // Timer should not advance further
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.elapsedTime).toBe(60);
  });

  it('should reset elapsedTime and cycle phrases when transitioning from WaitingForConfirmation to Responding', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result, rerender } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000); // 5s
    });
    expect(result.current.elapsedTime).toBe(5);

    await act(async () => {
      await rerender({ streamingState: StreamingState.WaitingForConfirmation });
    });
    expect(result.current.elapsedTime).toBe(5);
    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );

    await act(async () => {
      await rerender({ streamingState: StreamingState.Responding });
    });
    expect(result.current.elapsedTime).toBe(0); // Should reset
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      result.current.currentLoadingPhrase,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.elapsedTime).toBe(1);
  });

  it('should reset timer and phrase when streamingState changes from Responding to Idle', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result, rerender } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000); // 10s
    });
    expect(result.current.elapsedTime).toBe(10);

    await act(async () => {
      await rerender({ streamingState: StreamingState.Idle });
    });

    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });

  it('should reflect retry status in currentLoadingPhrase when provided', async () => {
    const retryStatus = {
      model: 'gemini-pro',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 1000,
    };
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
      retryStatus,
    );

    expect(result.current.currentLoadingPhrase).toContain('Trying to reach');
    expect(result.current.currentLoadingPhrase).toContain('Attempt 3/3');
  });

  it('should not show retry status phrase when idle', async () => {
    const retryStatus = {
      model: 'gemini-pro',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 1000,
    };
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Idle,
      false,
      retryStatus,
    );

    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });

  it('should hide low-verbosity retry status for early retry attempts', async () => {
    const retryStatus = {
      model: 'gemini-pro',
      attempt: 1,
      maxAttempts: 5,
      delayMs: 1000,
    };
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
      retryStatus,
      true,
      true,
      'low',
    );

    expect(result.current.currentLoadingPhrase).not.toBe(
      "This is taking a bit longer, we're still on it.",
    );
  });

  it('should show a generic retry phrase in low error verbosity mode for later retries', async () => {
    const retryStatus = {
      model: 'gemini-pro',
      attempt: 2,
      maxAttempts: 5,
      delayMs: 1000,
    };
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
      retryStatus,
      true,
      true,
      'low',
    );

    expect(result.current.currentLoadingPhrase).toBe(
      "This is taking a bit longer, we're still on it.",
    );
  });

  it('should show no phrases when showTips and showWit are false', async () => {
    const { result } = await renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
      null,
      false,
      false,
    );

    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });
});
