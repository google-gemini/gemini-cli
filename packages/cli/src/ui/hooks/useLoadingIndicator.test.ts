/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLoadingIndicator } from './useLoadingIndicator.js';
import { StreamingState } from '../types.js';
import {
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

describe('useLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers(); // Restore real timers after each test
  });

  it('should initialize with default values when Idle', () => {
    const { result } = renderHook(() =>
      useLoadingIndicator(StreamingState.Idle),
    );
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('should reflect values when Responding', () => {
    const { result } = renderHook(() =>
      useLoadingIndicator(StreamingState.Responding),
    );

    // Initial state before timers advance
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    // Phrase should cycle if PHRASE_CHANGE_INTERVAL_MS has passed
    // This depends on the actual implementation of usePhraseCycler
    // For simplicity, we'll check it's one of the witty phrases
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[1]);
  });

  it('should show waiting phrase and retain elapsedTime when WaitingForConfirmation', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.elapsedTime).toBe(60);

    rerender({ streamingState: StreamingState.WaitingForConfirmation });

    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );
    expect(result.current.elapsedTime).toBe(60); // Elapsed time should be retained

    // Timer should not advance further
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedTime).toBe(60);
  });

  it('should reset elapsedTime and use initial phrase when transitioning from WaitingForConfirmation to Responding', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    act(() => {
      vi.advanceTimersByTime(5000); // 5s
    });
    expect(result.current.elapsedTime).toBe(5);

    rerender({ streamingState: StreamingState.WaitingForConfirmation });
    expect(result.current.elapsedTime).toBe(5);
    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );

    rerender({ streamingState: StreamingState.Responding });
    expect(result.current.elapsedTime).toBe(0); // Should reset
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedTime).toBe(1);
  });

  it('should reset timer and phrase when streamingState changes from Responding to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useLoadingIndicator(streamingState),
      { initialProps: { streamingState: StreamingState.Responding } },
    );

    act(() => {
      vi.advanceTimersByTime(10000); // 10s
    });
    expect(result.current.elapsedTime).toBe(10);

    rerender({ streamingState: StreamingState.Idle });

    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);

    // Timer should not advance
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedTime).toBe(0);
  });
});
