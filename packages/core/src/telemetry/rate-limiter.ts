/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Rate limiter to prevent excessive telemetry recording
 * Ensures we don't send metrics more frequently than specified limits
 */
export class RateLimiter {
  private lastRecordTimes: Map<string, number> = new Map();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number = 60000) {
    // Default: 1 minute
    this.minIntervalMs = minIntervalMs;
  }

  /**
   * Check if we should record a metric based on rate limiting
   * @param metricKey - Unique key for the metric type/context
   * @param isHighPriority - If true, uses shorter interval for critical events
   * @returns true if metric should be recorded
   */
  shouldRecord(metricKey: string, isHighPriority: boolean = false): boolean {
    const now = Date.now();
    const lastRecordTime = this.lastRecordTimes.get(metricKey) || 0;

    // Use shorter interval for high priority events (e.g., memory leaks)
    const interval = isHighPriority
      ? this.minIntervalMs / 2
      : this.minIntervalMs;

    if (now - lastRecordTime >= interval) {
      this.lastRecordTimes.set(metricKey, now);
      return true;
    }

    return false;
  }

  /**
   * Force record a metric (bypasses rate limiting)
   * Use sparingly for critical events
   */
  forceRecord(metricKey: string): void {
    this.lastRecordTimes.set(metricKey, Date.now());
  }

  /**
   * Get time until next allowed recording for a metric
   */
  getTimeUntilNextAllowed(metricKey: string): number {
    const now = Date.now();
    const lastRecordTime = this.lastRecordTimes.get(metricKey) || 0;
    const nextAllowedTime = lastRecordTime + this.minIntervalMs;

    return Math.max(0, nextAllowedTime - now);
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    totalMetrics: number;
    oldestRecord: number;
    newestRecord: number;
    averageInterval: number;
  } {
    const recordTimes = Array.from(this.lastRecordTimes.values());

    if (recordTimes.length === 0) {
      return {
        totalMetrics: 0,
        oldestRecord: 0,
        newestRecord: 0,
        averageInterval: 0,
      };
    }

    const oldest = Math.min(...recordTimes);
    const newest = Math.max(...recordTimes);
    const totalSpan = newest - oldest;
    const averageInterval =
      recordTimes.length > 1 ? totalSpan / (recordTimes.length - 1) : 0;

    return {
      totalMetrics: recordTimes.length,
      oldestRecord: oldest,
      newestRecord: newest,
      averageInterval,
    };
  }

  /**
   * Clear all rate limiting state
   */
  reset(): void {
    this.lastRecordTimes.clear();
  }

  /**
   * Remove old entries to prevent memory leaks
   */
  cleanup(maxAgeMs: number = 3600000): void {
    // Default: 1 hour
    const cutoffTime = Date.now() - maxAgeMs;

    for (const [key, time] of this.lastRecordTimes.entries()) {
      if (time < cutoffTime) {
        this.lastRecordTimes.delete(key);
      }
    }
  }
}
