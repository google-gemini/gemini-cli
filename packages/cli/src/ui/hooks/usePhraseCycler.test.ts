/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePhraseCycler,
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

describe('usePhraseCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with a witty phrase when not active and not waiting', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = renderHook(() => usePhraseCycler(false, false));
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });

  it('should show "Waiting for user confirmation..." when isWaiting is true', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );
    rerender({ isActive: true, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');
  });

  it('should not cycle phrases if isActive is false and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    const initialPhrase = result.current;
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    expect(result.current).toBe(initialPhrase);
  });

  it('should cycle through witty phrases when isActive is true and not waiting', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = renderHook(() => usePhraseCycler(true, false));
    // Initial phrase should be one of the witty phrases
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    // Phrase should change and be one of the witty phrases
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });

  it('should reset to a witty phrase when isActive becomes true after being false (and not waiting)', () => {
    // Ensure there are at least two phrases for this test to be meaningful.
    if (WITTY_LOADING_PHRASES.length < 2) {
      return;
    }

    // Mock Math.random to make the test deterministic.
    const mockRandomValues = [
      0.5, // -> witty
      0, // -> index 0
      0.5, // -> witty
      1 / WITTY_LOADING_PHRASES.length, // -> index 1
      0.5, // -> witty
      0, // -> index 0
    ];
    let randomCallCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = mockRandomValues[randomCallCount % mockRandomValues.length];
      randomCallCount++;
      return val;
    });

    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: false, isWaiting: false } },
    );

    // Activate
    rerender({ isActive: true, isWaiting: false });
    const firstActivePhrase = result.current;
    expect(WITTY_LOADING_PHRASES).toContain(firstActivePhrase);
    // With our mock, this should be the first phrase.
    expect(firstActivePhrase).toBe(WITTY_LOADING_PHRASES[0]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });

    // Phrase should change to the second phrase.
    expect(result.current).not.toBe(firstActivePhrase);
    expect(result.current).toBe(WITTY_LOADING_PHRASES[1]);

    // Set to inactive - should reset to the default initial phrase
    rerender({ isActive: false, isWaiting: false });
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    // Set back to active - should pick a random witty phrase (which our mock controls)
    act(() => {
      rerender({ isActive: true, isWaiting: false });
    });
    // The random mock will now return 0, so it should be the first phrase again.
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('should clear phrase interval on unmount when active', () => {
    const { unmount } = renderHook(() => usePhraseCycler(true, false));
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('should use custom phrases when provided', () => {
    const customPhrases = ['Custom Phrase 1', 'Custom Phrase 2'];
    let callCount = 0;
    const randomMock = vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = callCount % 2;
      callCount++;
      return val / customPhrases.length;
    });

    const { result, rerender } = renderHook(
      ({ isActive, isWaiting, customPhrases: phrases }) =>
        usePhraseCycler(isActive, isWaiting, phrases),
      {
        initialProps: {
          isActive: true,
          isWaiting: false,
          customPhrases,
        },
      },
    );

    expect(result.current).toBe(customPhrases[0]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });

    expect(result.current).toBe(customPhrases[1]);

    // Test fallback to default phrases.
    randomMock.mockRestore();
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty

    rerender({ isActive: true, isWaiting: false, customPhrases: [] });

    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });

  it('should fall back to witty phrases if custom phrases are an empty array', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result } = renderHook(
      ({ isActive, isWaiting, customPhrases: phrases }) =>
        usePhraseCycler(isActive, isWaiting, phrases),
      {
        initialProps: {
          isActive: true,
          isWaiting: false,
          customPhrases: [],
        },
      },
    );

    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });

  it('should reset to a witty phrase when transitioning from waiting to active', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );

    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    // Cycle to a different phrase (potentially)
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    if (WITTY_LOADING_PHRASES.length > 1) {
      // This check is probabilistic with random selection
    }
    expect(WITTY_LOADING_PHRASES).toContain(result.current);

    // Go to waiting state
    rerender({ isActive: false, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');

    // Go back to active cycling - should pick a random witty phrase
    rerender({ isActive: true, isWaiting: false });
    expect(WITTY_LOADING_PHRASES).toContain(result.current);
  });
});
