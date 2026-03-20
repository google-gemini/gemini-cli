/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useTimer } from './useTimer.js';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTimerHook = async (
    initialIsActive: boolean,
    initialResetKey: number,
  ) => {
    let hookResult: ReturnType<typeof useTimer>;
    function TestComponent({
      isActive,
      resetKey,
    }: {
      isActive: boolean;
      resetKey: number;
    }) {
      hookResult = useTimer(isActive, resetKey);
      return null;
    }
    const { rerender, unmount } = await render(
      <TestComponent isActive={initialIsActive} resetKey={initialResetKey} />,
    );
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: { isActive: boolean; resetKey: number }) =>
        rerender(<TestComponent {...newProps} />),
      unmount,
    };
  };

  it('should initialize with 0', async () => {
    const { result } = await renderTimerHook(false, 0);
    expect(result.current).toBe(0);
  });

  it('should not increment time if isActive is false', async () => {
    const { result } = await renderTimerHook(false, 0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('should increment time every second if isActive is true', async () => {
    const { result } = await renderTimerHook(true, 0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(3);
  });

  it('should reset to 0 and start incrementing when isActive becomes true from false', async () => {
    const { result, rerender } = await renderTimerHook(false, 0);
    expect(result.current).toBe(0);

    act(() => {
      rerender({ isActive: true, resetKey: 0 });
    });
    expect(result.current).toBe(0); // Should reset to 0 upon becoming active

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });

  it('should reset to 0 when resetKey changes while active', async () => {
    const { result, rerender } = await renderTimerHook(true, 0);
    act(() => {
      vi.advanceTimersByTime(3000); // 3s
    });
    expect(result.current).toBe(3);

    act(() => {
      rerender({ isActive: true, resetKey: 1 }); // Change resetKey
    });
    expect(result.current).toBe(0); // Should reset to 0

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1); // Starts incrementing from 0
  });

  it('should be 0 if isActive is false, regardless of resetKey changes', async () => {
    const { result, rerender } = await renderTimerHook(false, 0);
    expect(result.current).toBe(0);

    act(() => {
      rerender({ isActive: false, resetKey: 1 });
    });
    expect(result.current).toBe(0);
  });

  it('should clear timer on unmount', async () => {
    const { unmount } = await renderTimerHook(true, 0);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('should preserve elapsedTime when isActive becomes false, and reset to 0 when it becomes active again', async () => {
    const { result, rerender } = await renderTimerHook(true, 0);

    act(() => {
      vi.advanceTimersByTime(3000); // Advance to 3 seconds
    });
    expect(result.current).toBe(3);

    act(() => {
      rerender({ isActive: false, resetKey: 0 });
    });
    expect(result.current).toBe(3); // Time should be preserved when timer becomes inactive

    // Now make it active again, it should reset to 0
    act(() => {
      rerender({ isActive: true, resetKey: 0 });
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });
});
