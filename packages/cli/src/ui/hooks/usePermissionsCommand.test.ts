/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePermissionsCommand } from './usePermissionsCommand.js';

describe('usePermissionsCommand', () => {
  it('should initialize with dialog closed', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    expect(result.current.isPermissionsDialogOpen).toBe(false);
  });

  it('should open the permissions dialog', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    act(() => {
      result.current.openPermissionsDialog();
    });

    expect(result.current.isPermissionsDialogOpen).toBe(true);
  });

  it('should close the permissions dialog', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    // First open it
    act(() => {
      result.current.openPermissionsDialog();
    });

    expect(result.current.isPermissionsDialogOpen).toBe(true);

    // Then close it
    act(() => {
      result.current.closePermissionsDialog();
    });

    expect(result.current.isPermissionsDialogOpen).toBe(false);
  });

  it('should maintain stable function references', () => {
    const { result, rerender } = renderHook(() => usePermissionsCommand());

    const initialOpenFn = result.current.openPermissionsDialog;
    const initialCloseFn = result.current.closePermissionsDialog;

    // Trigger rerender
    rerender();

    expect(result.current.openPermissionsDialog).toBe(initialOpenFn);
    expect(result.current.closePermissionsDialog).toBe(initialCloseFn);
  });

  it('should handle multiple open/close cycles', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    // Test multiple cycles
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.openPermissionsDialog();
      });
      expect(result.current.isPermissionsDialogOpen).toBe(true);

      act(() => {
        result.current.closePermissionsDialog();
      });
      expect(result.current.isPermissionsDialogOpen).toBe(false);
    }
  });

  it('should handle opening when already open', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    act(() => {
      result.current.openPermissionsDialog();
    });
    expect(result.current.isPermissionsDialogOpen).toBe(true);

    // Open again - should still be true
    act(() => {
      result.current.openPermissionsDialog();
    });
    expect(result.current.isPermissionsDialogOpen).toBe(true);
  });

  it('should handle closing when already closed', () => {
    const { result } = renderHook(() => usePermissionsCommand());

    expect(result.current.isPermissionsDialogOpen).toBe(false);

    // Close when already closed - should still be false
    act(() => {
      result.current.closePermissionsDialog();
    });
    expect(result.current.isPermissionsDialogOpen).toBe(false);
  });
});
