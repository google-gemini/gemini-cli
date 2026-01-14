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

  const renderLoadingIndicatorHook = (
    initialStreamingState: StreamingState,
    initialIsInteractiveShellWaiting: boolean = false,
    initialLastOutputTime: number = 0,
    initialRetryStatus: RetryAttemptPayload | null = null,
  ) => {
    let hookResult: ReturnType<typeof useLoadingIndicator>;
    function TestComponent({
      streamingState,
      isInteractiveShellWaiting,
      lastOutputTime,
      retryStatus,
    }: {
      streamingState: StreamingState;
      isInteractiveShellWaiting?: boolean;
      lastOutputTime?: number;
      retryStatus?: RetryAttemptPayload | null;
    }) {
      hookResult = useLoadingIndicator(
        streamingState,
        undefined,
        isInteractiveShellWaiting,
        lastOutputTime,
        retryStatus,
      );
      return null;
    }
    const { rerender } = render(
      <TestComponent
        streamingState={initialStreamingState}
        isInteractiveShellWaiting={initialIsInteractiveShellWaiting}
        lastOutputTime={initialLastOutputTime}
        retryStatus={initialRetryStatus}
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
        isInteractiveShellWaiting?: boolean;
        lastOutputTime?: number;
        retryStatus?: RetryAttemptPayload | null;
      }) => rerender(<TestComponent {...newProps} />),
    };
  };

  it('should initialize with default values when Idle', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = renderLoadingIndicatorHook(StreamingState.Idle);
    expect(result.current.elapsedTime).toBe(0);
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );
  });

  it('should show interactive shell waiting phrase when isInteractiveShellWaiting is true after 5s', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = renderLoadingIndicatorHook(
      StreamingState.Responding,
      true,
      1,
    );

    // Initially should be witty phrase or tip
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      result.current.currentLoadingPhrase,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.currentLoadingPhrase).toBe(
      INTERACTIVE_SHELL_WAITING_PHRASE,
    );
  });

  it('should reflect values when Responding', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { result } = renderLoadingIndicatorHook(StreamingState.Responding);

    // Initial phrase on first activation will be a tip, not necessarily from witty phrases
    expect(result.current.elapsedTime).toBe(0);
    // On first activation, it may show a tip, so we can't guarantee it's in WITTY_LOADING_PHRASES

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 1);
    });

    // Phrase should cycle if PHRASE_CHANGE_INTERVAL_MS has passed, now it should be witty since first activation already happened
    expect(WITTY_LOADING_PHRASES).toContain(
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

  it('should reset elapsedTime and use a witty phrase when transitioning from WaitingForConfirmation to Responding', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
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
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.elapsedTime).toBe(1);
  });

  it('should reset timer and phrase when streamingState changes from Responding to Idle', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
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
    expect(WITTY_LOADING_PHRASES).toContain(
      result.current.currentLoadingPhrase,
    );

    // Timer should not advance
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.elapsedTime).toBe(0);
  });

  it('should reflect retry status in currentLoadingPhrase when provided', () => {
    const retryStatus = {
      model: 'gemini-pro',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 1000,
    };
    const { result } = renderLoadingIndicatorHook(
      StreamingState.Responding,
      false,
      0,
      retryStatus,
    );

    expect(result.current.currentLoadingPhrase).toBe(
      'Trying to reach gemini-pro (Attempt 2/3)',
    );
  });
});
