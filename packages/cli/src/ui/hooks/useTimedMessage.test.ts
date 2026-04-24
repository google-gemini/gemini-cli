/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useTimedMessage } from './useTimedMessage.js';

describe('useTimedMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets the timeout when the same message is retriggered', async () => {
    const { result, unmount } = await renderHook(() => useTimedMessage(1000));

    act(() => {
      result.current[1]('hint');
    });
    expect(result.current[0]).toBe('hint');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      result.current[1]('hint');
    });
    expect(result.current[0]).toBe('hint');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current[0]).toBe('hint');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current[0]).toBeNull();

    unmount();
  });

  it('clears the message immediately when asked to hide it', async () => {
    const { result, unmount } = await renderHook(() => useTimedMessage(1000));

    act(() => {
      result.current[1]('hint');
    });
    expect(result.current[0]).toBe('hint');

    act(() => {
      result.current[1](null);
    });
    expect(result.current[0]).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current[0]).toBeNull();

    unmount();
  });
});
