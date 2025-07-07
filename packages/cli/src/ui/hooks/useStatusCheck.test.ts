/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatusCheck } from './useStatusCheck.js';
import { type Config } from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';

// Mock dependencies
vi.mock('../../utils/version.js', () => ({
  getCliVersion: vi.fn().mockResolvedValue('1.0.0'),
}));

const mockCheckConnectivity = vi.fn();
const mockGetModel = vi.fn().mockReturnValue('gemini-pro');

const createMockConfig = (): Partial<Config> => ({
  getGeminiClient: vi.fn().mockReturnValue({
    checkConnectivity: mockCheckConnectivity,
  }),
  getModel: mockGetModel,
  getProjectRoot: vi.fn().mockReturnValue('/root'),
  getTargetDir: vi.fn().mockReturnValue('/root/target'),
  getUserMemory: vi.fn().mockReturnValue('test memory'),
  getMcpServers: vi.fn().mockReturnValue({}),
  getDebugMode: vi.fn().mockReturnValue(false),
  getApprovalMode: vi.fn().mockReturnValue('auto'),
  getCheckpointingEnabled: vi.fn().mockReturnValue(true),
  merged: {
    contextFileName: 'GEMINI.md',
  },
});

const createMockSettings = (): LoadedSettings =>
  new LoadedSettings(
    { path: '/user/settings.json', settings: {} },
    {
      path: '/ws/.gemini/settings.json',
      settings: { selectedAuthType: 'gcloud' },
    },
    [],
  );

describe('useStatusCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCheckConnectivity.mockClear();
    mockGetModel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should report success when connectivity check succeeds', async () => {
    mockCheckConnectivity.mockResolvedValue(undefined);
    const mockConfig = createMockConfig() as Config;
    const mockSettings = createMockSettings();

    const { result } = renderHook(() =>
      useStatusCheck(mockConfig, mockSettings, true),
    );

    await act(async () => {
      await Promise.resolve(); // Let promises resolve
    });

    expect(result.current.connectivity).toBe('success');
    expect(result.current.error).toBeNull();
    expect(result.current.isComplete).toBe(true);
  });

  it('should report an error when connectivity check fails', async () => {
    const testError = new Error('Network failure');
    mockCheckConnectivity.mockRejectedValue(testError);
    const mockConfig = createMockConfig() as Config;
    const mockSettings = createMockSettings();

    const { result } = renderHook(() =>
      useStatusCheck(mockConfig, mockSettings, true),
    );

    await act(async () => {
      await Promise.resolve(); // Let promises resolve
    });

    expect(result.current.connectivity).toBe('error');
    expect(result.current.error).toBe('Network failure');
    expect(result.current.isComplete).toBe(true);
  });

  it('should time out if connectivity check takes too long', async () => {
    // Mock a promise that never resolves
    mockCheckConnectivity.mockReturnValue(new Promise(() => {}));
    const mockConfig = createMockConfig() as Config;
    const mockSettings = createMockSettings();

    const { result } = renderHook(() =>
      useStatusCheck(mockConfig, mockSettings, true),
    );

    // Initial state should be pending
    expect(result.current.connectivity).toBe('pending');

    // Advance timers past the 10-second timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10001);
    });

    expect(result.current.connectivity).toBe('error');
    expect(result.current.error).toContain('Connectivity check timed out');
    expect(result.current.isComplete).toBe(true);
  });

  it('should not run check if not enabled', () => {
    const mockConfig = createMockConfig() as Config;
    const mockSettings = createMockSettings();

    const { result } = renderHook(() =>
      useStatusCheck(mockConfig, mockSettings, false),
    );

    expect(mockCheckConnectivity).not.toHaveBeenCalled();
    expect(result.current.connectivity).toBe('pending');
    expect(result.current.isComplete).toBe(false);
  });

  it('should clear timeout on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    mockCheckConnectivity.mockReturnValue(new Promise(() => {})); // Never resolves
    const mockConfig = createMockConfig() as Config;
    const mockSettings = createMockSettings();

    const { unmount } = renderHook(() =>
      useStatusCheck(mockConfig, mockSettings, true),
    );

    // Unmount the hook before the timeout completes
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    clearTimeoutSpy.mockRestore();
  });
});
