/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  useMemoryMonitor,
  MEMORY_CHECK_INTERVAL,
  MEMORY_WARNING_THRESHOLD,
} from './useMemoryMonitor.js';
import process from 'node:process';
import { MessageType } from '../types.js';

describe('useMemoryMonitor', () => {
  const memoryUsageSpy = vi.spyOn(process, 'memoryUsage');
  const addItem = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not warn when memory usage is below threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: MEMORY_WARNING_THRESHOLD / 2,
    } as NodeJS.MemoryUsage);
    renderHook(() => useMemoryMonitor({ addItem }));
    vi.advanceTimersByTime(10000);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('should warn when memory usage is above threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: MEMORY_WARNING_THRESHOLD * 1.5,
    } as NodeJS.MemoryUsage);
    renderHook(() => useMemoryMonitor({ addItem }));
    vi.advanceTimersByTime(MEMORY_CHECK_INTERVAL);
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.WARNING,
        text: 'High memory usage detected: 10.50 GB. If you experience a crash, please file a bug report by running `/bug`',
      },
      expect.any(Number),
    );
  });

  it('should only warn once', () => {
    memoryUsageSpy.mockReturnValue({
      rss: MEMORY_WARNING_THRESHOLD * 1.5,
    } as NodeJS.MemoryUsage);
    const { rerender } = renderHook(() => useMemoryMonitor({ addItem }));
    vi.advanceTimersByTime(MEMORY_CHECK_INTERVAL);
    expect(addItem).toHaveBeenCalledTimes(1);

    // Rerender and advance timers, should not warn again
    memoryUsageSpy.mockReturnValue({
      rss: MEMORY_WARNING_THRESHOLD * 1.5,
    } as NodeJS.MemoryUsage);
    rerender();
    vi.advanceTimersByTime(MEMORY_CHECK_INTERVAL);
    expect(addItem).toHaveBeenCalledTimes(1);
  });
});
