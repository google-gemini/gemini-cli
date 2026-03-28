/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { MetricPoint } from '../types.js';

export abstract class BaseCollector {
  protected metrics: MetricPoint[] = [];
  protected maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  protected record(
    value: number,
    unit: string,
    tags?: Record<string, string>,
  ): void {
    this.metrics.push({
      timestamp: Date.now(),
      value,
      unit,
      tags,
    });

    if (this.metrics.length > this.maxSize) {
      this.metrics = this.metrics.slice(-this.maxSize);
    }
  }

  getAll(): MetricPoint[] {
    return [...this.metrics];
  }

  getInTimeRange(ms: number): MetricPoint[] {
    const cutoff = Date.now() - ms;
    return this.metrics.filter((m) => m.timestamp >= cutoff);
  }

  getAverage(timeRangeMs = 60000): number {
    const recent = this.getInTimeRange(timeRangeMs);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
  }

  getStats(timeRangeMs = 60000): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } {
    const recent = this.getInTimeRange(timeRangeMs);
    if (recent.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const values = recent.map((m) => m.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: recent.length,
    };
  }

  clear(): void {
    this.metrics = [];
  }
}
