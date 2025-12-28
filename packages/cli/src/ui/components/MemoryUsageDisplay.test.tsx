/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import process from 'node:process';
import { act } from 'react';

describe('MemoryUsageDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Mock process.memoryUsage
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1024 * 1024 * 50, // 50MB
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders memory usage', () => {
    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toContain('50.0 MB');
  });

  it('updates memory usage over time', async () => {
    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toContain('50.0 MB');

    vi.mocked(process.memoryUsage).mockReturnValue({
      rss: 1024 * 1024 * 100, // 100MB
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(lastFrame()).toContain('100.0 MB');
  });
});
