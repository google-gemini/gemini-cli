/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseCollector } from './base-collector.js';

interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers?: number;
}

export class MemoryCollector extends BaseCollector {
  private static instance: MemoryCollector;
  private warningThreshold = 0.85; // 85% of heap total
  private criticalThreshold = 0.95; // 95% of heap total
  private interval: NodeJS.Timeout | null = null;
  private listeners: Array<
    (warning: string, level: 'warning' | 'critical') => void
  > = [];

  private constructor() {
    super(500); // Keep last 500 snapshots
  }

  static getInstance(): MemoryCollector {
    if (!MemoryCollector.instance) {
      MemoryCollector.instance = new MemoryCollector();
    }
    return MemoryCollector.instance;
  }

  startMonitoring(intervalMs = 5000): void {
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);

    this.takeSnapshot(); // Initial snapshot
  }

  stopMonitoring(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  onWarning(
    callback: (warning: string, level: 'warning' | 'critical') => void,
  ): void {
    this.listeners.push(callback);
  }

  private takeSnapshot(): void {
    const usage = process.memoryUsage();

    this.record(usage.heapUsed, 'bytes', { type: 'heapUsed' });
    this.record(usage.heapTotal, 'bytes', { type: 'heapTotal' });
    this.record(usage.rss, 'bytes', { type: 'rss' });
    this.record(usage.external, 'bytes', { type: 'external' });

    this.checkMemoryHealth(usage);
  }

  private checkMemoryHealth(usage: MemoryUsage): void {
    const heapRatio = usage.heapUsed / usage.heapTotal;

    if (heapRatio > this.criticalThreshold) {
      const warning = `CRITICAL: Memory usage at ${(heapRatio * 100).toFixed(1)}% of heap limit!`;
      this.listeners.forEach((l) => l(warning, 'critical'));
    } else if (heapRatio > this.warningThreshold) {
      const warning = `WARNING: Memory usage at ${(heapRatio * 100).toFixed(1)}% of heap limit`;
      this.listeners.forEach((l) => l(warning, 'warning'));
    }
  }

  getCurrent(): MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Override BaseCollector.getStats() to operate only on heapUsed metrics.
   * The base implementation mixes ALL recorded metric types (heapUsed,
   * heapTotal, rss, external) into a single average, producing meaningless
   * numbers. This override filters to heapUsed only, matching what the
   * dashboard actually wants to display.
   *
   * @param timeRangeMs  Look-back window in milliseconds (default 5 minutes).
   */
  override getStats(timeRangeMs = 300000): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } {
    const cutoff = Date.now() - timeRangeMs;
    const heapUsedMetrics = this.metrics.filter(
      (m) => m.timestamp >= cutoff && m.tags?.['type'] === 'heapUsed',
    );

    if (heapUsedMetrics.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const values = heapUsedMetrics.map((m) => m.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: heapUsedMetrics.length,
    };
  }

  getTrend(): {
    direction: 'increasing' | 'decreasing' | 'stable';
    ratePerMinute: number;
    projectedOOMIn?: number;
  } {
    const recent = this.getInTimeRange(300000); // Last 5 minutes
    const heapMetrics = recent.filter((m) => m.tags?.['type'] === 'heapUsed');

    if (heapMetrics.length < 2) {
      return { direction: 'stable', ratePerMinute: 0 };
    }

    const first = heapMetrics[0];
    const last = heapMetrics[heapMetrics.length - 1];
    const timeDiffMinutes = (last.timestamp - first.timestamp) / 60000;
    const valueDiff = last.value - first.value;
    const ratePerMinute = timeDiffMinutes > 0 ? valueDiff / timeDiffMinutes : 0;

    let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(ratePerMinute) < 1024 * 1024) {
      // Less than 1 MB/min → stable
      direction = 'stable';
    } else if (ratePerMinute > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    const current = this.getCurrent();
    const remainingHeap = current.heapTotal - current.heapUsed;
    let projectedOOMIn: number | undefined;

    if (ratePerMinute > 0 && remainingHeap > 0) {
      projectedOOMIn = remainingHeap / ratePerMinute; // minutes
      // Don't bother showing if more than 24 hours away.
      if (projectedOOMIn > 24 * 60) {
        projectedOOMIn = undefined;
      }
    }

    return {
      direction,
      ratePerMinute: Math.abs(ratePerMinute) / (1024 * 1024), // → MB/min
      projectedOOMIn,
    };
  }

  getHeapHistory(): Array<{
    timestamp: number;
    used: number;
    total: number;
  }> {
    return this.metrics
      .filter(
        (m) =>
          m.tags?.['type'] === 'heapUsed' || m.tags?.['type'] === 'heapTotal',
      )
      .reduce(
        (acc, m) => {
          const existing = acc.find((a) => a.timestamp === m.timestamp);
          if (existing) {
            if (m.tags?.['type'] === 'heapUsed') existing.used = m.value;
            if (m.tags?.['type'] === 'heapTotal') existing.total = m.value;
          } else {
            acc.push({
              timestamp: m.timestamp,
              used: m.tags?.['type'] === 'heapUsed' ? m.value : 0,
              total: m.tags?.['type'] === 'heapTotal' ? m.value : 0,
            });
          }
          return acc;
        },
        [] as Array<{ timestamp: number; used: number; total: number }>,
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  override clear(): void {
    super.clear();
    this.listeners = [];
  }
}
