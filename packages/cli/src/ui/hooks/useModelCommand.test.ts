/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useModelCommand } from './useModelCommand.js';
import { vi } from 'vitest';
import { Config, DEFAULT_GEMINI_MODEL } from '@google/gemini-cli-core';

describe('useModelCommand', () => {
  const mockAddItem = vi.fn();
  const mockSetCurrentModel = vi.fn();
  const mockConfig = {
    setModel: vi.fn(),
    getModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be initially closed', () => {
    const { result } = renderHook(() =>
      useModelCommand(mockConfig, mockAddItem, mockSetCurrentModel),
    );
    expect(result.current.isModelDialogOpen).toBe(false);
  });

  it('should open the dialog', () => {
    const { result } = renderHook(() =>
      useModelCommand(mockConfig, mockAddItem, mockSetCurrentModel),
    );
    act(() => {
      result.current.openModelDialog();
    });
    expect(result.current.isModelDialogOpen).toBe(true);
  });

  it('should set the model and close the dialog on select', () => {
    const { result } = renderHook(() =>
      useModelCommand(mockConfig, mockAddItem, mockSetCurrentModel),
    );
    act(() => {
      result.current.openModelDialog();
    });

    act(() => {
      result.current.handleModelSelect('gemini-2.5-flash');
    });

    expect(mockConfig.setModel).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(mockSetCurrentModel).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Model set to gemini-2.5-flash' }),
      expect.any(Number),
    );
    expect(result.current.isModelDialogOpen).toBe(false);
  });

  it('should close the dialog without setting the model if no model is selected', () => {
    const { result } = renderHook(() =>
      useModelCommand(mockConfig, mockAddItem, mockSetCurrentModel),
    );
    act(() => {
      result.current.openModelDialog();
    });

    act(() => {
      result.current.handleModelSelect(undefined);
    });

    expect(mockConfig.setModel).not.toHaveBeenCalled();
    expect(mockSetCurrentModel).not.toHaveBeenCalled();
    expect(result.current.isModelDialogOpen).toBe(false);
  });
});
