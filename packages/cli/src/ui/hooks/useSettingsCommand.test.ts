/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettingsCommand } from './useSettingsCommand.js';

describe('useSettingsCommand', () => {
  it('should return settings dialog state and functions', () => {
    const { result } = renderHook(() => useSettingsCommand());

    expect(result.current).toHaveProperty('isSettingsDialogOpen');
    expect(result.current).toHaveProperty('openSettingsDialog');
    expect(result.current).toHaveProperty('closeSettingsDialog');
  });

  it('should initialize with dialog closed', () => {
    const { result } = renderHook(() => useSettingsCommand());

    expect(result.current.isSettingsDialogOpen).toBe(false);
  });

  it('should open dialog when openSettingsDialog is called', () => {
    const { result } = renderHook(() => useSettingsCommand());

    act(() => {
      result.current.openSettingsDialog();
    });

    expect(result.current.isSettingsDialogOpen).toBe(true);
  });

  it('should close dialog when closeSettingsDialog is called', () => {
    const { result } = renderHook(() => useSettingsCommand());

    act(() => {
      result.current.openSettingsDialog();
    });

    expect(result.current.isSettingsDialogOpen).toBe(true);

    act(() => {
      result.current.closeSettingsDialog();
    });

    expect(result.current.isSettingsDialogOpen).toBe(false);
  });

  it('should toggle dialog state multiple times', () => {
    const { result } = renderHook(() => useSettingsCommand());

    // Initially closed
    expect(result.current.isSettingsDialogOpen).toBe(false);

    // Open
    act(() => {
      result.current.openSettingsDialog();
    });
    expect(result.current.isSettingsDialogOpen).toBe(true);

    // Close
    act(() => {
      result.current.closeSettingsDialog();
    });
    expect(result.current.isSettingsDialogOpen).toBe(false);

    // Open again
    act(() => {
      result.current.openSettingsDialog();
    });
    expect(result.current.isSettingsDialogOpen).toBe(true);
  });

  it('should handle multiple consecutive opens', () => {
    const { result } = renderHook(() => useSettingsCommand());

    act(() => {
      result.current.openSettingsDialog();
      result.current.openSettingsDialog();
    });

    expect(result.current.isSettingsDialogOpen).toBe(true);
  });

  it('should handle multiple consecutive closes', () => {
    const { result } = renderHook(() => useSettingsCommand());

    act(() => {
      result.current.openSettingsDialog();
    });

    act(() => {
      result.current.closeSettingsDialog();
      result.current.closeSettingsDialog();
    });

    expect(result.current.isSettingsDialogOpen).toBe(false);
  });

  it('should have stable function references', () => {
    const { result, rerender } = renderHook(() => useSettingsCommand());

    const initialOpenFn = result.current.openSettingsDialog;
    const initialCloseFn = result.current.closeSettingsDialog;

    rerender();

    expect(result.current.openSettingsDialog).toBe(initialOpenFn);
    expect(result.current.closeSettingsDialog).toBe(initialCloseFn);
  });

  it('should maintain function stability after state changes', () => {
    const { result } = renderHook(() => useSettingsCommand());

    const openFn = result.current.openSettingsDialog;
    const closeFn = result.current.closeSettingsDialog;

    act(() => {
      result.current.openSettingsDialog();
    });

    expect(result.current.openSettingsDialog).toBe(openFn);
    expect(result.current.closeSettingsDialog).toBe(closeFn);
  });

  it('should return functions that are callable', () => {
    const { result } = renderHook(() => useSettingsCommand());

    expect(typeof result.current.openSettingsDialog).toBe('function');
    expect(typeof result.current.closeSettingsDialog).toBe('function');
  });

  it('should start with consistent initial state across multiple instances', () => {
    const { result: result1 } = renderHook(() => useSettingsCommand());
    const { result: result2 } = renderHook(() => useSettingsCommand());

    expect(result1.current.isSettingsDialogOpen).toBe(
      result2.current.isSettingsDialogOpen,
    );
  });

  it('should not affect other instances when opening', () => {
    const { result: result1 } = renderHook(() => useSettingsCommand());
    const { result: result2 } = renderHook(() => useSettingsCommand());

    act(() => {
      result1.current.openSettingsDialog();
    });

    expect(result1.current.isSettingsDialogOpen).toBe(true);
    expect(result2.current.isSettingsDialogOpen).toBe(false);
  });
});
