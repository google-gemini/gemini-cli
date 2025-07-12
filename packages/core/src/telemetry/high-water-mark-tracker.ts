/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tracks high-water marks for memory usage to reduce noise from garbage collection
 * Only triggers when memory usage increases by a significant threshold
 */
export class HighWaterMarkTracker {
  private waterMarks: Map<string, number> = new Map();
  private recentReadings: Array<{
    timestamp: number;
    value: number;
    metricType: string;
  }> = [];
  private readonly growthThresholdPercent: number;
  private readonly smoothingWindowSize: number;

  constructor(
    growthThresholdPercent: number = 5,
    smoothingWindowSize: number = 3,
  ) {
    this.growthThresholdPercent = growthThresholdPercent;
    this.smoothingWindowSize = smoothingWindowSize;
  }

  /**
   * Check if current value represents a new high-water mark that should trigger recording
   * @param metricType - Type of metric (e.g., 'heap_used', 'rss')
   * @param currentValue - Current metric value in bytes
   * @returns true if this is a significant new high-water mark
   */
  shouldRecordMetric(metricType: string, currentValue: number): boolean {
    // Get current high-water mark
    const currentWaterMark = this.waterMarks.get(metricType) || 0;

    // For first measurement, always record
    if (currentWaterMark === 0) {
      this.waterMarks.set(metricType, currentValue);
      this.addReading(metricType, currentValue);
      return true;
    }

    // Smooth the reading to reduce GC noise
    const smoothedValue = this.smoothReading(metricType, currentValue);

    // Check if smoothed value exceeds threshold
    const thresholdValue =
      currentWaterMark * (1 + this.growthThresholdPercent / 100);

    if (smoothedValue > thresholdValue) {
      // Update high-water mark
      this.waterMarks.set(metricType, smoothedValue);
      return true;
    }

    return false;
  }

  /**
   * Add a reading to the internal tracking
   */
  private addReading(metricType: string, value: number): void {
    this.recentReadings.push({
      timestamp: Date.now(),
      value,
      metricType,
    });

    // Keep only recent readings (within smoothing window)
    const cutoffTime = Date.now() - 10000; // 10 seconds
    this.recentReadings = this.recentReadings.filter(
      (r) => r.timestamp > cutoffTime,
    );
  }

  /**
   * Smooth a reading using median of recent values to reduce GC noise
   */
  private smoothReading(metricType: string, value: number): number {
    // Add new reading
    this.addReading(metricType, value);

    // Get recent readings for this metric type
    const recentValuesForMetric = this.recentReadings
      .filter((r) => r.metricType === metricType)
      .slice(-this.smoothingWindowSize)
      .map((r) => r.value);

    if (recentValuesForMetric.length <= 1) {
      return value;
    }

    // For small windows, just return the current value to be responsive
    if (recentValuesForMetric.length <= 2) {
      return value;
    }

    // Use weighted average that favors recent values
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < recentValuesForMetric.length; i++) {
      const weight = i + 1; // More weight for recent values
      weightedSum += recentValuesForMetric[i] * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
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
    this.recentReadings = [];
  }

  /**
   * Get memory growth percentage since last high-water mark
   */
  getGrowthPercentage(metricType: string, currentValue: number): number {
    const waterMark = this.waterMarks.get(metricType);
    if (!waterMark || waterMark === 0) {
      return 0;
    }
    return ((currentValue - waterMark) / waterMark) * 100;
  }
}
