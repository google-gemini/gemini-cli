/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useBell } from './useBell.js';
import { StreamingState } from '../types.js';

const mockWrite = vi.fn();
vi.mock('ink', () => ({
  useStdout: () => ({ stdout: { write: mockWrite } }),
}));

const mockUseSettings = vi.fn();
vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: () => mockUseSettings(),
}));

const mockUseUIState = vi.fn();
vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => mockUseUIState(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: { error: vi.fn() },
  };
});

describe('useBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not ring bell on mount even if conditions are met', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    mockUseUIState.mockReturnValue({
      streamingState: StreamingState.Idle,
      dialogsVisible: false,
      history: [],
    });

    renderHook(() => useBell());

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should ring bell when streamingState becomes Idle (action completed)', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    let uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [] as any[],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.Idle,
      dialogsVisible: false,
      history: [],
    };
    rerender();

    expect(mockWrite).toHaveBeenCalledWith('\x07');
  });

  it('should ring bell when dialogsVisible becomes true', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    let uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [] as any[],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: true,
      history: [],
    };
    rerender();

    expect(mockWrite).toHaveBeenCalledWith('\x07');
  });

  it('should ring bell when streamingState becomes WaitingForConfirmation', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    let uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [] as any[],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.WaitingForConfirmation,
      dialogsVisible: false,
      history: [],
    };
    rerender();

    expect(mockWrite).toHaveBeenCalledWith('\x07');
  });

  it('should not ring bell if action was cancelled', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    let uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [] as any[],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.Idle,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [{ text: 'Request cancelled.' }] as any[],
    };
    rerender();

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should not ring bell if setting is disabled', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: false } } });
    let uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: [] as any[],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.Idle,
      dialogsVisible: false,
      history: [],
    };
    rerender();

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should not ring bell if streamingState changes to Responding', () => {
    mockUseSettings.mockReturnValue({ merged: { ui: { bell: true } } });
    let uiState = {
      streamingState: StreamingState.Idle,
      dialogsVisible: false,
      history: [],
    };
    mockUseUIState.mockImplementation(() => uiState);

    const { rerender } = renderHook(() => useBell());

    uiState = {
      streamingState: StreamingState.Responding,
      dialogsVisible: false,
      history: [],
    };
    rerender();

    expect(mockWrite).not.toHaveBeenCalled();
  });
});
