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

  it('should initialize with the first witty phrase when not active and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
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
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });

  it('should cycle through witty phrases when isActive is true and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(true, false));
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[1]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(result.current).toBe(
      WITTY_LOADING_PHRASES[2 % WITTY_LOADING_PHRASES.length],
    );
  });

  it('should reset to the first phrase when isActive becomes true after being false (and not waiting)', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: false, isWaiting: false } },
    );
    // Cycle to a different phrase
    rerender({ isActive: true, isWaiting: false });
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(result.current).not.toBe(WITTY_LOADING_PHRASES[0]);

    // Set to inactive
    rerender({ isActive: false, isWaiting: false });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]); // Should reset to first phrase

    // Set back to active
    rerender({ isActive: true, isWaiting: false });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]); // Should start with the first phrase
  });

  it('should clear phrase interval on unmount when active', () => {
    const { unmount } = renderHook(() => usePhraseCycler(true, false));
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('should reset to the first witty phrase when transitioning from waiting to active', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );

    // Cycle to a different phrase
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[1]);

    // Go to waiting state
    rerender({ isActive: false, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');

    // Go back to active cycling
    rerender({ isActive: true, isWaiting: false });
    expect(result.current).toBe(WITTY_LOADING_PHRASES[0]);
  });
});
