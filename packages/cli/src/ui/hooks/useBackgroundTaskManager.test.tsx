/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import {
  useBackgroundTaskManager,
  type BackgroundTaskManagerProps,
} from './useBackgroundTaskManager.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { type BackgroundTask } from './shellReducer.js';

describe('useBackgroundTaskManager', () => {
  const setEmbeddedShellFocused = vi.fn();
  const terminalHeight = 30;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderHook = async (props: BackgroundTaskManagerProps) => {
    let hookResult: ReturnType<typeof useBackgroundTaskManager>;
    function TestComponent({ p }: { p: BackgroundTaskManagerProps }) {
      hookResult = useBackgroundTaskManager(p);
      return null;
    }
    const { rerender } = await render(<TestComponent p={props} />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: BackgroundTaskManagerProps) =>
        rerender(<TestComponent p={newProps} />),
    };
  };

  it('should initialize with correct default values', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>();
    const { result } = await renderHook({
      backgroundTasks,
      backgroundTaskCount: 0,
      isBackgroundTaskVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.isBackgroundTaskListOpen).toBe(false);
    expect(result.current.activeBackgroundTaskPid).toBe(null);
    expect(result.current.backgroundTaskHeight).toBe(0);
  });

  it('should auto-select the first background shell when added', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>();
    const { result, rerender } = await renderHook({
      backgroundTasks,
      backgroundTaskCount: 0,
      isBackgroundTaskVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    const newShells = new Map<number, BackgroundTask>([
      [123, {} as BackgroundTask],
    ]);
    rerender({
      backgroundTasks: newShells,
      backgroundTaskCount: 1,
      isBackgroundTaskVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundTaskPid).toBe(123);
  });

  it('should reset state when all shells are removed', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>([
      [123, {} as BackgroundTask],
    ]);
    const { result, rerender } = await renderHook({
      backgroundTasks,
      backgroundTaskCount: 1,
      isBackgroundTaskVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    act(() => {
      result.current.setIsBackgroundTaskListOpen(true);
    });
    expect(result.current.isBackgroundTaskListOpen).toBe(true);

    rerender({
      backgroundTasks: new Map(),
      backgroundTaskCount: 0,
      isBackgroundTaskVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundTaskPid).toBe(null);
    expect(result.current.isBackgroundTaskListOpen).toBe(false);
  });

  it('should unfocus embedded shell when no shells are active', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>([
      [123, {} as BackgroundTask],
    ]);
    await renderHook({
      backgroundTasks,
      backgroundTaskCount: 1,
      isBackgroundTaskVisible: false, // Background shell not visible
      activePtyId: null, // No foreground shell
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(setEmbeddedShellFocused).toHaveBeenCalledWith(false);
  });

  it('should calculate backgroundTaskHeight correctly when visible', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>([
      [123, {} as BackgroundTask],
    ]);
    const { result } = await renderHook({
      backgroundTasks,
      backgroundTaskCount: 1,
      isBackgroundTaskVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight: 100,
    });

    // 100 * 0.3 = 30
    expect(result.current.backgroundTaskHeight).toBe(30);
  });

  it('should maintain current active shell if it still exists', async () => {
    const backgroundTasks = new Map<number, BackgroundTask>([
      [123, {} as BackgroundTask],
      [456, {} as BackgroundTask],
    ]);
    const { result, rerender } = await renderHook({
      backgroundTasks,
      backgroundTaskCount: 2,
      isBackgroundTaskVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    act(() => {
      result.current.setActiveBackgroundTaskPid(456);
    });
    expect(result.current.activeBackgroundTaskPid).toBe(456);

    // Remove the OTHER shell
    const updatedShells = new Map<number, BackgroundTask>([
      [456, {} as BackgroundTask],
    ]);
    rerender({
      backgroundTasks: updatedShells,
      backgroundTaskCount: 1,
      isBackgroundTaskVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundTaskPid).toBe(456);
  });
});
