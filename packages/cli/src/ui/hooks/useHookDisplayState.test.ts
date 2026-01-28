/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '../../test-utils/render.js';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useHookDisplayState } from './useHookDisplayState.js';
import {
  coreEvents,
  CoreEvent,
  type HookStartPayload,
  type HookEndPayload,
} from '@google/gemini-cli-core';
import { act } from 'react';

describe('useHookDisplayState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    coreEvents.removeAllListeners(CoreEvent.HookStart);
    coreEvents.removeAllListeners(CoreEvent.HookEnd);
  });

  it('should initialize with empty hooks', () => {
    const { result } = renderHook(() => useHookDisplayState());
    expect(result.current).toEqual([]);
  });

  it('should add a hook when HookStart event is emitted', () => {
    const { result } = renderHook(() => useHookDisplayState());

    const payload: HookStartPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
      hookIndex: 1,
      totalHooks: 1,
    };

    act(() => {
      coreEvents.emitHookStart(payload);
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      name: 'test-hook',
      eventName: 'before-agent',
    });
  });

  it('should remove a hook immediately if duration > 1s', () => {
    const { result } = renderHook(() => useHookDisplayState());

    const startPayload: HookStartPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
    };

    act(() => {
      coreEvents.emitHookStart(startPayload);
    });

    // Advance time by 1.1 seconds
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const endPayload: HookEndPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
      success: true,
    };

    act(() => {
      coreEvents.emitHookEnd(endPayload);
    });

    expect(result.current).toHaveLength(0);
  });

  it('should delay removal if duration < 1s', () => {
    const { result } = renderHook(() => useHookDisplayState());

    const startPayload: HookStartPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
    };

    act(() => {
      coreEvents.emitHookStart(startPayload);
    });

    // Advance time by only 100ms
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const endPayload: HookEndPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
      success: true,
    };

    act(() => {
      coreEvents.emitHookEnd(endPayload);
    });

    // Should still be present
    expect(result.current).toHaveLength(1);

    // Advance remaining time (900ms needed, let's go 950ms)
    act(() => {
      vi.advanceTimersByTime(950);
    });

    expect(result.current).toHaveLength(0);
  });

  it('should handle multiple hooks correctly', () => {
    const { result } = renderHook(() => useHookDisplayState());

    act(() => {
      coreEvents.emitHookStart({ hookName: 'h1', eventName: 'e1' });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      coreEvents.emitHookStart({ hookName: 'h2', eventName: 'e1' });
    });

    expect(result.current).toHaveLength(2);

    // End h1 (total time 500ms -> needs 500ms delay)
    act(() => {
      coreEvents.emitHookEnd({
        hookName: 'h1',
        eventName: 'e1',
        success: true,
      });
    });

    // h1 still there
    expect(result.current).toHaveLength(2);

    // Advance 600ms. h1 should disappear. h2 has been running for 600ms.
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('h2');

    // End h2 (total time 600ms -> needs 400ms delay)
    act(() => {
      coreEvents.emitHookEnd({
        hookName: 'h2',
        eventName: 'e1',
        success: true,
      });
    });

    expect(result.current).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toHaveLength(0);
  });

  it('should handle interleaved hooks with same name and event', () => {
    const { result } = renderHook(() => useHookDisplayState());
    const hook = { hookName: 'same-hook', eventName: 'same-event' };

    // Start Hook 1 at t=0
    act(() => {
      coreEvents.emitHookStart(hook);
    });

    // Advance to t=500
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Start Hook 2 at t=500
    act(() => {
      coreEvents.emitHookStart(hook);
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].name).toBe('same-hook');
    expect(result.current[1].name).toBe('same-hook');

    // End Hook 1 at t=600 (Duration 600ms -> delay 400ms)
    act(() => {
      vi.advanceTimersByTime(100);
      coreEvents.emitHookEnd({ ...hook, success: true });
    });

    // Both still visible (Hook 1 pending removal in 400ms)
    expect(result.current).toHaveLength(2);

    // Advance 400ms (t=1000). Hook 1 should be removed.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toHaveLength(1);

    // End Hook 2 at t=1100 (Duration: 1100 - 500 = 600ms -> delay 400ms)
    act(() => {
      vi.advanceTimersByTime(100);
      coreEvents.emitHookEnd({ ...hook, success: true });
    });

    // Hook 2 still visible (pending removal in 400ms)
    expect(result.current).toHaveLength(1);

    // Advance 400ms (t=1500). Hook 2 should be removed.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toHaveLength(0);
  });
});
