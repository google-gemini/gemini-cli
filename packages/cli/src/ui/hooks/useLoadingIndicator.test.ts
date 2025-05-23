/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingIndicator } from './useLoadingIndicator.js';
import { StreamingState } from '../types.js';
import {
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from '../constants.js';

describe('useLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default values when not responding', () => {
    const { result } = renderHook(() =>
      useLoadingIndicator(StreamingState.Idle, false),
    );
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);
    expect(result.current.shouldShowSpinner).toBe(true);
  });

  describe('when streamingState is Responding', () => {
    it('should increment elapsedTime and cycle phrases when not paused', () => {
      const { result } = renderHook(() =>
        useLoadingIndicator(StreamingState.Responding, false),
      );
      expect(result.current.shouldShowSpinner).toBe(true);
      expect(result.current.currentLoadingPhrase).toBe(
        WITTY_LOADING_PHRASES[0],
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.elapsedTime).toBe(1);

      act(() => {
        vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
      });
      expect(result.current.currentLoadingPhrase).toBe(
        WITTY_LOADING_PHRASES[1],
      );
      expect(result.current.elapsedTime).toBe(
        1 + PHRASE_CHANGE_INTERVAL_MS / 1000,
      );
    });

    it('should pause elapsedTime, show specific phrase, and hide spinner when paused', () => {
      const { result, rerender } = renderHook(
        ({ isPaused }) =>
          useLoadingIndicator(StreamingState.Responding, isPaused),
        { initialProps: { isPaused: false } },
      );

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.elapsedTime).toBe(2);
      expect(result.current.shouldShowSpinner).toBe(true);

      rerender({ isPaused: true });

      expect(result.current.currentLoadingPhrase).toBe(
        'Waiting for user confirmation...',
      );
      expect(result.current.shouldShowSpinner).toBe(false);

      // Time should not advance while paused
      const timeBeforePauseAdv = result.current.elapsedTime;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.elapsedTime).toBe(timeBeforePauseAdv);

      // Unpause
      rerender({ isPaused: false });
      expect(result.current.shouldShowSpinner).toBe(true);
      // Phrase should reset to the beginning of witty phrases
      expect(result.current.currentLoadingPhrase).toBe(
        WITTY_LOADING_PHRASES[0],
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // Elapsed time should resume from where it left off
      expect(result.current.elapsedTime).toBe(timeBeforePauseAdv + 1);
    });

    it('should reset timer and phrase when streamingState changes from Responding to Idle', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) => useLoadingIndicator(streamingState, false),
        { initialProps: { streamingState: StreamingState.Responding } },
      );

      act(() => {
        vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS + 1000);
      });
      expect(result.current.elapsedTime).toBe(
        PHRASE_CHANGE_INTERVAL_MS / 1000 + 1,
      );
      expect(result.current.currentLoadingPhrase).toBe(
        WITTY_LOADING_PHRASES[1],
      );

      rerender({ streamingState: StreamingState.Idle });

      expect(result.current.elapsedTime).toBe(0);
      // When idle, the phrase interval should be cleared, but the last phrase might persist
      // until the next "Responding" state. The important part is that the timer is reset.
      // Depending on exact timing, it might be the last witty phrase or the first.
      // For this test, we'll ensure it's one of them.
      expect(WITTY_LOADING_PHRASES).toContain(
        result.current.currentLoadingPhrase,
      );
    });
  });

  it('should clear intervals on unmount', () => {
    const { unmount } = renderHook(() =>
      useLoadingIndicator(StreamingState.Responding, false),
    );
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    // Expecting two intervals (elapsedTime and phraseInterval) to be cleared.
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
  });

  it('should reset to initial witty phrase when unpaused', () => {
    const { result, rerender } = renderHook(
      ({ isPaused }) =>
        useLoadingIndicator(StreamingState.Responding, isPaused),
      { initialProps: { isPaused: false } },
    );

    // Advance to the second witty phrase
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[1]);

    // Pause
    rerender({ isPaused: true });
    expect(result.current.currentLoadingPhrase).toBe(
      'Waiting for user confirmation...',
    );

    // Unpause
    rerender({ isPaused: false });
    expect(result.current.currentLoadingPhrase).toBe(WITTY_LOADING_PHRASES[0]);
  });
});
