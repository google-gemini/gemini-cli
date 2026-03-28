/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCollector } from '../../../src/performance/collectors/memory-collector.js';

describe('MemoryCollector', () => {
  let collector: MemoryCollector;

  beforeEach(() => {
    collector = MemoryCollector.getInstance();
    collector.clear();
  });

  afterEach(() => {
    collector.stopMonitoring();
    vi.restoreAllMocks(); // important cleanup
  });

  it('should take memory snapshots', () => {
    collector.startMonitoring(100);

    const current = collector.getCurrent();

    expect(current).toHaveProperty('heapUsed');
    expect(current).toHaveProperty('heapTotal');
    expect(current).toHaveProperty('rss');
    expect(current).toHaveProperty('external');
    expect(current).toHaveProperty('arrayBuffers'); // added for completeness
  });

  it('should calculate memory stats', async () => {
    collector.startMonitoring(100);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const stats = collector.getStats(200);

    expect(stats.count).toBeGreaterThan(0);
    expect(stats.min).toBeLessThanOrEqual(stats.max);
    expect(stats.avg).toBeGreaterThan(0);
  });

  it('should detect memory trends', async () => {
    const mockHeapUsed = [
      100 * 1024 * 1024,
      150 * 1024 * 1024,
      200 * 1024 * 1024,
    ];

    let callCount = 0;

    vi.spyOn(process, 'memoryUsage').mockImplementation(
      (): NodeJS.MemoryUsage => ({
        heapUsed: mockHeapUsed[callCount++] || 200 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024,
        rss: 600 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      }),
    );

    collector.startMonitoring(100);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const trend = collector.getTrend();

    expect(trend.direction).toBe('increasing');
    expect(trend.ratePerMinute).toBeGreaterThan(0);
  });

  it('should emit warnings on high memory usage', async () => {
    const warnings: string[] = [];
    collector.onWarning((warning) => warnings.push(warning));

    vi.spyOn(process, 'memoryUsage').mockImplementation(
      (): NodeJS.MemoryUsage => ({
        heapUsed: 450 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024, // 90% usage
        rss: 600 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      }),
    );

    collector.startMonitoring(100);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('WARNING');
  });
});
