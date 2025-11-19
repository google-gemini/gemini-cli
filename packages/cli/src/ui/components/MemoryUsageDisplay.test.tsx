/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';

vi.mock('../utils/formatters.js', () => ({
  formatMemoryUsage: vi.fn(
    (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)}MB`,
  ),
}));

describe('MemoryUsageDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render memory usage on initial load', () => {
    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toBeDefined();
  });

  it('should display formatted memory usage', () => {
    const { lastFrame, rerender } = render(<MemoryUsageDisplay />);
    vi.advanceTimersByTime(100);
    rerender(<MemoryUsageDisplay />);
    expect(lastFrame()).toContain('MB');
  });

  it('should update memory usage periodically', async () => {
    const { formatMemoryUsage } = await import('../utils/formatters.js');
    vi.mocked(formatMemoryUsage).mockClear();
    render(<MemoryUsageDisplay />);

    expect(formatMemoryUsage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(formatMemoryUsage).toHaveBeenCalledTimes(2);
  });

  it('should render pipe separator', () => {
    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toContain('|');
  });

  it('should call process.memoryUsage', () => {
    const spy = vi.spyOn(process, 'memoryUsage');
    render(<MemoryUsageDisplay />);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should update every 2 seconds', () => {
    const spy = vi.spyOn(process, 'memoryUsage');
    render(<MemoryUsageDisplay />);

    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2000);
    expect(spy).toHaveBeenCalledTimes(3);

    spy.mockRestore();
  });

  it('should clean up interval on unmount', () => {
    const spy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<MemoryUsageDisplay />);
    unmount();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<MemoryUsageDisplay />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<MemoryUsageDisplay />);
    expect(() => unmount()).not.toThrow();
  });

  it('should format memory correctly', async () => {
    const { formatMemoryUsage } = await import('../utils/formatters.js');
    const mockRss = 1024 * 1024 * 500; // 500MB
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: mockRss,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });

    render(<MemoryUsageDisplay />);
    expect(formatMemoryUsage).toHaveBeenCalledWith(mockRss);
  });

  it('should handle very high memory usage', () => {
    const mockRss = 3 * 1024 * 1024 * 1024; // 3GB
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: mockRss,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });

    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toBeDefined();
  });

  it('should handle low memory usage', () => {
    const mockRss = 100 * 1024 * 1024; // 100MB
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: mockRss,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });

    const { lastFrame } = render(<MemoryUsageDisplay />);
    expect(lastFrame()).toBeDefined();
  });
});
