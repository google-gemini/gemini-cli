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
import { WARNING_PROMPT_DURATION_MS } from '../constants.js';

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

  it('should remove a hook immediately if duration > minimum duration', () => {
    const { result } = renderHook(() => useHookDisplayState());

    const startPayload: HookStartPayload = {
      hookName: 'test-hook',
      eventName: 'before-agent',
    };

    act(() => {
      coreEvents.emitHookStart(startPayload);
    });

    // Advance time by slightly more than the minimum duration
    act(() => {
      vi.advanceTimersByTime(WARNING_PROMPT_DURATION_MS + 100);
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

  it('should delay removal if duration < minimum duration', () => {
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

    // Advance remaining time + buffer
    act(() => {
      vi.advanceTimersByTime(WARNING_PROMPT_DURATION_MS - 100 + 50);
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

    // End h1 (total time 500ms -> needs remaining delay)
    act(() => {
      coreEvents.emitHookEnd({
        hookName: 'h1',
        eventName: 'e1',
        success: true,
      });
    });

    // h1 still there
    expect(result.current).toHaveLength(2);

    // Advance enough for h1 to expire.
    // h1 ran for 500ms. Needs WARNING_PROMPT_DURATION_MS total.
    // So advance WARNING_PROMPT_DURATION_MS - 500 + 100.
    const advanceForH1 = WARNING_PROMPT_DURATION_MS - 500 + 100;
    act(() => {
      vi.advanceTimersByTime(advanceForH1);
    });

    // h1 should disappear. h2 has been running for 500 (initial) + advanceForH1.
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('h2');

    // End h2.
    // h2 duration so far: 0 (start) -> 500 (start h2) -> (end h1) -> advanceForH1.
    // Actually h2 started at t=500. Current time is t=500 + advanceForH1.
    // Duration = advanceForH1.
    // advanceForH1 = 3000 - 500 + 100 = 2600.
    // So h2 has run for 2600ms. Needs 400ms more.
    act(() => {
      coreEvents.emitHookEnd({
        hookName: 'h2',
        eventName: 'e1',
        success: true,
      });
    });

    expect(result.current).toHaveLength(1);

    // Advance remaining needed for h2 + buffer
    // 3000 - 2600 = 400.
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

    // End Hook 1 at t=600 (Duration 600ms -> delay needed)
    act(() => {
      vi.advanceTimersByTime(100);
      coreEvents.emitHookEnd({ ...hook, success: true });
    });

    // Both still visible
    expect(result.current).toHaveLength(2);

    // Advance to make Hook 1 expire.
    // Hook 1 duration 600ms. Needs WARNING_PROMPT_DURATION_MS total.
    // Needs WARNING_PROMPT_DURATION_MS - 600 more.
    const advanceForHook1 = WARNING_PROMPT_DURATION_MS - 600;
    act(() => {
      vi.advanceTimersByTime(advanceForHook1);
    });

    expect(result.current).toHaveLength(1);

    // End Hook 2.
    // Hook 2 started at t=500.
    // Current time: t = 600 (hook 1 end) + advanceForHook1 = 600 + 3000 - 600 = 3000.
    // Hook 2 duration = 3000 - 500 = 2500ms.
    // Needs 3000 - 2500 = 500ms more.
    act(() => {
      vi.advanceTimersByTime(100); // just a small step before ending
      coreEvents.emitHookEnd({ ...hook, success: true });
    });

    // Hook 2 still visible (pending removal)
    // Total run time: 2500 + 100 = 2600ms. Needs 400ms.
    expect(result.current).toHaveLength(1);

    // Advance remaining
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toHaveLength(0);
  });
});
