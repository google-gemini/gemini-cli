/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import {
  useBackgroundShellManager,
  type BackgroundShellManagerProps,
} from './useBackgroundShellManager.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { type BackgroundShell } from './shellReducer.js';

describe('useBackgroundShellManager', () => {
  const setEmbeddedShellFocused = vi.fn();
  const terminalHeight = 30;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderHook = (props: BackgroundShellManagerProps) => {
    let hookResult: ReturnType<typeof useBackgroundShellManager>;
    function TestComponent({ p }: { p: BackgroundShellManagerProps }) {
      hookResult = useBackgroundShellManager(p);
      return null;
    }
    const { rerender } = render(<TestComponent p={props} />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: BackgroundShellManagerProps) =>
        rerender(<TestComponent p={newProps} />),
    };
  };

  it('should initialize with correct default values', () => {
    const backgroundShells = new Map<number, BackgroundShell>();
    const { result } = renderHook({
      backgroundShells,
      backgroundShellCount: 0,
      isBackgroundShellVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.isBackgroundShellListOpen).toBe(false);
    expect(result.current.activeBackgroundShellPid).toBe(null);
    expect(result.current.backgroundShellHeight).toBe(0);
  });

  it('should auto-select the first background shell when added', () => {
    const backgroundShells = new Map<number, BackgroundShell>();
    const { result, rerender } = renderHook({
      backgroundShells,
      backgroundShellCount: 0,
      isBackgroundShellVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    const newShells = new Map<number, BackgroundShell>([
      [123, {} as BackgroundShell],
    ]);
    rerender({
      backgroundShells: newShells,
      backgroundShellCount: 1,
      isBackgroundShellVisible: false,
      activePtyId: null,
      embeddedShellFocused: false,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundShellPid).toBe(123);
  });

  it('should reset state when all shells are removed', () => {
    const backgroundShells = new Map<number, BackgroundShell>([
      [123, {} as BackgroundShell],
    ]);
    const { result, rerender } = renderHook({
      backgroundShells,
      backgroundShellCount: 1,
      isBackgroundShellVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    act(() => {
      result.current.setIsBackgroundShellListOpen(true);
    });
    expect(result.current.isBackgroundShellListOpen).toBe(true);

    rerender({
      backgroundShells: new Map(),
      backgroundShellCount: 0,
      isBackgroundShellVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundShellPid).toBe(null);
    expect(result.current.isBackgroundShellListOpen).toBe(false);
  });

  it('should unfocus embedded shell when no shells are active', () => {
    const backgroundShells = new Map<number, BackgroundShell>([
      [123, {} as BackgroundShell],
    ]);
    renderHook({
      backgroundShells,
      backgroundShellCount: 1,
      isBackgroundShellVisible: false, // Background shell not visible
      activePtyId: null, // No foreground shell
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(setEmbeddedShellFocused).toHaveBeenCalledWith(false);
  });

  it('should calculate backgroundShellHeight correctly when visible', () => {
    const backgroundShells = new Map<number, BackgroundShell>([
      [123, {} as BackgroundShell],
    ]);
    const { result } = renderHook({
      backgroundShells,
      backgroundShellCount: 1,
      isBackgroundShellVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight: 100,
    });

    // 100 * 0.3 = 30
    expect(result.current.backgroundShellHeight).toBe(30);
  });

  it('should maintain current active shell if it still exists', () => {
    const backgroundShells = new Map<number, BackgroundShell>([
      [123, {} as BackgroundShell],
      [456, {} as BackgroundShell],
    ]);
    const { result, rerender } = renderHook({
      backgroundShells,
      backgroundShellCount: 2,
      isBackgroundShellVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    act(() => {
      result.current.setActiveBackgroundShellPid(456);
    });
    expect(result.current.activeBackgroundShellPid).toBe(456);

    // Remove the OTHER shell
    const updatedShells = new Map<number, BackgroundShell>([
      [456, {} as BackgroundShell],
    ]);
    rerender({
      backgroundShells: updatedShells,
      backgroundShellCount: 1,
      isBackgroundShellVisible: true,
      activePtyId: null,
      embeddedShellFocused: true,
      setEmbeddedShellFocused,
      terminalHeight,
    });

    expect(result.current.activeBackgroundShellPid).toBe(456);
  });
});
