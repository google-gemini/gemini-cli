/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useTimedMessage } from './useTimedMessage.js';
import { act } from 'react';

describe('useTimedMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should only update state and re-render when the message changes', async () => {
    let renderCount = 0;
    const { result } = await renderHook(() => {
      renderCount++;
      return useTimedMessage<boolean>(1000);
    });

    // Initial render
    expect(renderCount).toBe(1);
    expect(result.current[0]).toBe(null);

    // First update - should trigger re-render
    await act(async () => {
      result.current[1](true);
    });

    expect(renderCount).toBe(2);
    expect(result.current[0]).toBe(true);

    // Second update with SAME value - should NOT trigger re-render
    await act(async () => {
      result.current[1](true);
    });

    expect(renderCount).toBe(2); // Still 2
    expect(result.current[0]).toBe(true);

    // Third update with DIFFERENT value - should trigger re-render
    await act(async () => {
      result.current[1](false);
    });

    expect(renderCount).toBe(3);
    expect(result.current[0]).toBe(false);
  });

  it('should reset timeout even if the message is the same', async () => {
    const { result } = await renderHook(() => useTimedMessage<string>(1000));

    await act(async () => {
      result.current[1]('hello');
    });

    expect(result.current[0]).toBe('hello');

    // Advance halfway
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Trigger same message - should reset timer
    await act(async () => {
      result.current[1]('hello');
    });

    // Advance another 600ms - total 1100ms since first call, but only 600ms since second
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Should still be 'hello' because timer was reset
    expect(result.current[0]).toBe('hello');

    // Advance remaining 400ms
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current[0]).toBe(null);
  });
});
