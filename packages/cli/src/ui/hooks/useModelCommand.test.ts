/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModelCommand } from './useModelCommand.js';

describe('useModelCommand', () => {
  it('should initialize with the model dialog closed', () => {
    const { result } = renderHook(() => useModelCommand());
    expect(result.current.isModelDialogOpen).toBe(false);
  });

  it('should open the model dialog when openModelDialog is called', () => {
    const { result } = renderHook(() => useModelCommand());

    act(() => {
      result.current.openModelDialog();
    });

    expect(result.current.isModelDialogOpen).toBe(true);
  });

  it('should close the model dialog when closeModelDialog is called', () => {
    const { result } = renderHook(() => useModelCommand());

    // Open it first
    act(() => {
      result.current.openModelDialog();
    });
    expect(result.current.isModelDialogOpen).toBe(true);

    // Then close it
    act(() => {
      result.current.closeModelDialog();
    });
    expect(result.current.isModelDialogOpen).toBe(false);
  });
});
