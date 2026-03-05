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
import type { LoadingPhrasesMode } from '../../config/settings.js';

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

  const renderLoadingIndicatorHook = (
    initialStreamingState: StreamingState,
    initialShouldShowFocusHint: boolean = false,
    initialRetryStatus: RetryAttemptPayload | null = null,
    loadingPhrases: LoadingPhrasesMode = 'all',
    initialErrorVerbosity: 'low' | 'full' = 'full',
  ) => {
    let hookResult: ReturnType<typeof useLoadingIndicator>;
    function TestComponent({
      streamingState,
      shouldShowFocusHint,
      retryStatus,
      loadingPhrases,
      errorVerbosity,
    }: {
      streamingState: StreamingState;
      shouldShowFocusHint?: boolean;
      retryStatus?: RetryAttemptPayload | null;
      loadingPhrases?: LoadingPhrasesMode;
      errorVerbosity?: 'low' | 'full';
    }) {
      hookResult = useLoadingIndicator({
        streamingState,
        shouldShowFocusHint: !!shouldShowFocusHint,
        retryStatus: retryStatus || null,
        loadingPhrasesMode: loadingPhrases,
        errorVerbosity,
      });
      return null;
    }
    const { rerender } = render(
      <TestComponent
        streamingState={initialStreamingState}
        shouldShowFocusHint={initialShouldShowFocusHint}
        retryStatus={initialRetryStatus}
        loadingPhrases={loadingPhrases}
        errorVerbosity={initialErrorVerbosity}
      />,
    );
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: {
        streamingState: StreamingState;
        shouldShowFocusHint?: boolean;
        retryStatus?: RetryAttemptPayload | null;
        loadingPhrases?: LoadingPhrasesMode;
        errorVerbosity?: 'low' | 'full';
      }) =>
        rerender(
          <TestComponent
            loadingPhrases={loadingPhrases}
            errorVerbosity={initialErrorVerbosity}
            {...newProps}
          />,
        ),
    };
  };

  it('should initialize with default values when Idle', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { result } = renderLoadingIndicatorHook(StreamingState.Idle);
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });

  it('should show interactive shell waiting phrase when shouldShowFocusHint is true', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { result, rerender } = renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
    );

    await act(async () => {
      rerender({
        streamingState: StreamingState.Responding,
        shouldShowFocusHint: true,
      });
    });

    expect(result.current.currentLoadingPhrase).toBe(
      INTERACTIVE_SHELL_WAITING_PHRASE,
    );
  });

  it('should reflect values when Responding', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { result } = renderLoadingIndicatorHook(StreamingState.Responding);

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
    const { result, rerender } = renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(result.current.elapsedTime).toBe(60);

    act(() => {
      rerender({ streamingState: StreamingState.WaitingForConfirmation });
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
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { result, rerender } = renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000); // 5s
    });
    expect(result.current.elapsedTime).toBe(5);

    act(() => {
      rerender({ streamingState: StreamingState.WaitingForConfirmation });
    });
    expect(result.current.elapsedTime).toBe(5);
    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );

    act(() => {
      rerender({ streamingState: StreamingState.Responding });
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
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { result, rerender } = renderLoadingIndicatorHook(
      StreamingState.Responding,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000); // 10s
    });
    expect(result.current.elapsedTime).toBe(10);

    act(() => {
      rerender({ streamingState: StreamingState.Idle });
    });

    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBeUndefined();
  });
});
