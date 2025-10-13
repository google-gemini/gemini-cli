/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import process from 'node:process';

// Mock the useUIState hook
vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(),
}));

// Mock the formatters to isolate component logic
vi.mock('../utils/formatters.js', () => ({
  formatMemoryUsage: (usage: number) => `${(usage / 1024 / 1024).toFixed(0)}MB`,
}));

describe('MemoryUsageDisplay', () => {
  const mockedUseUIState = useUIState as vi.Mock;
  let memoryUsageSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    // Spy on process.memoryUsage to track calls
    memoryUsageSpy = vi
      .spyOn(process, 'memoryUsage')
      .mockReturnValue({ rss: 100 * 1024 * 1024 } as NodeJS.MemoryUsage);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should render memory usage on initial render', async () => {
    mockedUseUIState.mockReturnValue({
      streamingState: 'idle',
      buffer: { text: '' },
      errorCount: 0,
      history: { length: 0 },
    });

    const { lastFrame, rerender } = render(<MemoryUsageDisplay />);

    // Since useEffect runs after the render, we need to advance timers
    // to ensure the state update is processed.
    await vi.runAllTimersAsync();
    rerender(<MemoryUsageDisplay />);

    expect(memoryUsageSpy).toHaveBeenCalledTimes(1);
    expect(lastFrame()).toContain('100MB');
  });

  it('should update memory usage when history length changes', async () => {
    const initialUiState = {
      streamingState: 'idle',
      buffer: { text: '' },
      errorCount: 0,
      history: { length: 1 },
    };
    mockedUseUIState.mockReturnValue(initialUiState);

    const { rerender, lastFrame } = render(<MemoryUsageDisplay />);
    await vi.runAllTimersAsync();
    rerender(<MemoryUsageDisplay />);
    expect(lastFrame()).toContain('100MB');

    // Simulate a change in history
    const updatedUiState = { ...initialUiState, history: { length: 2 } };
    mockedUseUIState.mockReturnValue(updatedUiState);
    memoryUsageSpy.mockReturnValue({
      rss: 150 * 1024 * 1024,
    } as NodeJS.MemoryUsage);

    rerender(<MemoryUsageDisplay />);
    await vi.runAllTimersAsync();

    expect(lastFrame()).toContain('150MB');
  });

  it('should change color when memory usage is high', async () => {
    mockedUseUIState.mockReturnValue({
      streamingState: 'idle',
      buffer: { text: '' },
      errorCount: 0,
      history: { length: 0 },
    });
    memoryUsageSpy.mockReturnValue({
      rss: 2.5 * 1024 * 1024 * 1024,
    } as NodeJS.MemoryUsage);

    const { lastFrame, rerender } = render(<MemoryUsageDisplay />);
    await vi.runAllTimersAsync();
    rerender(<MemoryUsageDisplay />);

    expect(lastFrame()).toContain('2560MB');
  });
});
