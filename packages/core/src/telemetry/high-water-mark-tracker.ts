/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * High-water mark tracker for memory metrics
 * Only triggers when memory usage increases by a significant threshold
 */
export class HighWaterMarkTracker {
  private waterMarks: Map<string, number> = new Map();
  private readonly growthThresholdPercent: number;

  constructor(growthThresholdPercent: number = 5) {
    this.growthThresholdPercent = growthThresholdPercent;
  }

  /**
   * Check if current value represents a new high-water mark that should trigger recording
   * @param metricType - Type of metric (e.g., 'heap_used', 'rss')
   * @param currentValue - Current memory value in bytes
   * @returns true if this value should trigger a recording
   */
  shouldRecordMetric(metricType: string, currentValue: number): boolean {
    // Get current high-water mark
    const currentWaterMark = this.waterMarks.get(metricType) || 0;

    // For first measurement, always record
    if (currentWaterMark === 0) {
      this.waterMarks.set(metricType, currentValue);
      return true;
    }

    // Check if current value exceeds threshold
    const thresholdValue =
      currentWaterMark * (1 + this.growthThresholdPercent / 100);

    if (currentValue > thresholdValue) {
      // Update high-water mark
      this.waterMarks.set(metricType, currentValue);
      return true;
    }

    return false;
  }

  /**
   * Get current high-water mark for a metric type
   */
  getHighWaterMark(metricType: string): number {
    return this.waterMarks.get(metricType) || 0;
  }

  /**
   * Get all high-water marks
   */
  getAllHighWaterMarks(): Record<string, number> {
    return Object.fromEntries(this.waterMarks);
  }

  /**
   * Reset high-water mark for a specific metric type
   */
  resetHighWaterMark(metricType: string): void {
    this.waterMarks.delete(metricType);
  }

  /**
   * Reset all high-water marks
   */
  resetAllHighWaterMarks(): void {
    this.waterMarks.clear();
  }
}
