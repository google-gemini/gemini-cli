/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModelCommand } from './useModelCommand.js';
import { makeFakeConfig, type Config } from '@google/gemini-cli-core';

describe('useModelCommand', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig();
  });

  it('should initialize with the model dialog closed', () => {
    const { result } = renderHook(() => useModelCommand(mockConfig));
    expect(result.current.isModelDialogOpen).toBe(false);
  });

  it('should open the model dialog when openModelDialog is called', () => {
    const { result } = renderHook(() => useModelCommand(mockConfig));

    act(() => {
      result.current.openModelDialog();
    });

    expect(result.current.isModelDialogOpen).toBe(true);
  });

  it('should close the model dialog when closeModelDialog is called', () => {
    const { result } = renderHook(() => useModelCommand(mockConfig));

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

  it('should set the model and close the dialog when handleModelSelect is called', () => {
    const setModelSpy = vi.spyOn(mockConfig, 'setModel');
    const { result } = renderHook(() => useModelCommand(mockConfig));

    // Open it first
    act(() => {
      result.current.openModelDialog();
    });
    expect(result.current.isModelDialogOpen).toBe(true);

    // Select a model
    act(() => {
      result.current.handleModelSelect('test-model');
    });

    // Assertions
    expect(setModelSpy).toHaveBeenCalledWith('test-model');
    expect(result.current.isModelDialogOpen).toBe(false);
  });
});
