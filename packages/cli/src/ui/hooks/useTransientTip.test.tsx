/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useTransientTip } from './useTransientTip.js';

describe('useTransientTip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTransientTipHook = (initialValue: unknown, duration?: number) => {
    let hookResult: boolean;
    function TestComponent({ val, dur }: { val: unknown; dur?: number }) {
      hookResult = useTransientTip(val, dur);
      return null;
    }
    const { rerender } = render(
      <TestComponent val={initialValue} dur={duration} />,
    );
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: { val: unknown; dur?: number }) =>
        rerender(<TestComponent {...newProps} />),
    };
  };

  it('should return true initially when triggerValue is provided', () => {
    const { result } = renderTransientTipHook('test');
    expect(result.current).toBe(true);
  });

  it('should return false after the duration', () => {
    const { result } = renderTransientTipHook('test', 1000);
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(false);
  });

  it('should reset the timer when triggerValue changes', () => {
    const { result, rerender } = renderTransientTipHook('test1', 1000);

    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe(true);

    // Rerender with new value
    act(() => {
      rerender({ val: 'test2', dur: 1000 });
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // It should still be true because the 1000ms timer was reset at 500ms
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toBe(false);
  });

  it('should return false if triggerValue is null or undefined', () => {
    const { result, rerender } = renderTransientTipHook('test');

    expect(result.current).toBe(true);

    act(() => {
      rerender({ val: null });
    });
    expect(result.current).toBe(false);

    act(() => {
      rerender({ val: 'test2' });
    });
    expect(result.current).toBe(true);

    act(() => {
      rerender({ val: undefined });
    });
    expect(result.current).toBe(false);
  });
});
