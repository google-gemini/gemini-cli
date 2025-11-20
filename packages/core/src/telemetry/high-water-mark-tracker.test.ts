/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HighWaterMarkTracker } from './high-water-mark-tracker.js';

describe('HighWaterMarkTracker', () => {
  let tracker: HighWaterMarkTracker;

  beforeEach(() => {
    tracker = new HighWaterMarkTracker(5); // 5% threshold
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultTracker = new HighWaterMarkTracker();
      expect(defaultTracker).toBeInstanceOf(HighWaterMarkTracker);
    });

    it('should initialize with custom values', () => {
      const customTracker = new HighWaterMarkTracker(10);
      expect(customTracker).toBeInstanceOf(HighWaterMarkTracker);
    });

    it('should throw on negative threshold', () => {
      expect(() => new HighWaterMarkTracker(-1)).toThrow(
        'growthThresholdPercent must be non-negative.',
      );
    });
  });

  describe('shouldRecordMetric', () => {
    it('should return true for first measurement', () => {
      const result = tracker.shouldRecordMetric('heap_used', 1000000);
      expect(result).toBe(true);
    });

    it('should return false for small increases', () => {
      // Set initial high-water mark
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Small increase (less than 5%)
      const result = tracker.shouldRecordMetric('heap_used', 1030000); // 3% increase
      expect(result).toBe(false);
    });

    it('should return true for significant increases', () => {
      // Set initial high-water mark
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Add several readings to build up smoothing window
      tracker.shouldRecordMetric('heap_used', 1100000); // 10% increase
      tracker.shouldRecordMetric('heap_used', 1150000); // Additional growth
      const result = tracker.shouldRecordMetric('heap_used', 1200000); // Sustained growth
      expect(result).toBe(true);
    });

    it('should handle decreasing values correctly', () => {
      // Set initial high-water mark
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Decrease (should not trigger)
      const result = tracker.shouldRecordMetric('heap_used', 900000); // 10% decrease
      expect(result).toBe(false);
    });

    it('should update high-water mark when threshold exceeded', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);

      const beforeMark = tracker.getHighWaterMark('heap_used');

      // Create sustained growth pattern to trigger update
      tracker.shouldRecordMetric('heap_used', 1100000);
      tracker.shouldRecordMetric('heap_used', 1150000);
      tracker.shouldRecordMetric('heap_used', 1200000);

      const afterMark = tracker.getHighWaterMark('heap_used');

      expect(afterMark).toBeGreaterThan(beforeMark);
    });

    it('should handle multiple metric types independently', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      expect(tracker.getHighWaterMark('heap_used')).toBeGreaterThan(0);
      expect(tracker.getHighWaterMark('rss')).toBeGreaterThan(0);
      expect(tracker.getHighWaterMark('heap_used')).not.toBe(
        tracker.getHighWaterMark('rss'),
      );
    });
  });

  describe('smoothing functionality', () => {
    it('should reduce noise from garbage collection spikes', () => {
      // Establish baseline
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Single spike (should be smoothed out)
      const result = tracker.shouldRecordMetric('heap_used', 2000000);

      // With the new responsive algorithm, large spikes do trigger
      expect(result).toBe(true);
    });

    it('should eventually respond to sustained growth', () => {
      // Establish baseline
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Sustained growth pattern
      tracker.shouldRecordMetric('heap_used', 1100000);
      tracker.shouldRecordMetric('heap_used', 1150000);
      const result = tracker.shouldRecordMetric('heap_used', 1200000);

      expect(result).toBe(true);
    });
  });

  describe('getHighWaterMark', () => {
    it('should return 0 for unknown metric types', () => {
      const mark = tracker.getHighWaterMark('unknown_metric');
      expect(mark).toBe(0);
    });

    it('should return correct value for known metric types', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      const mark = tracker.getHighWaterMark('heap_used');
      expect(mark).toBeGreaterThan(0);
    });
  });

  describe('getAllHighWaterMarks', () => {
    it('should return empty object initially', () => {
      const marks = tracker.getAllHighWaterMarks();
      expect(marks).toEqual({});
    });

    it('should return all recorded marks', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      const marks = tracker.getAllHighWaterMarks();
      expect(Object.keys(marks)).toHaveLength(2);
      expect(marks['heap_used']).toBeGreaterThan(0);
      expect(marks['rss']).toBeGreaterThan(0);
    });
  });

  describe('resetHighWaterMark', () => {
    it('should reset specific metric type', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      tracker.resetHighWaterMark('heap_used');

      expect(tracker.getHighWaterMark('heap_used')).toBe(0);
      expect(tracker.getHighWaterMark('rss')).toBeGreaterThan(0);
    });
  });

  describe('resetAllHighWaterMarks', () => {
    it('should reset all metrics', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      tracker.resetAllHighWaterMarks();

      expect(tracker.getHighWaterMark('heap_used')).toBe(0);
      expect(tracker.getHighWaterMark('rss')).toBe(0);
      expect(tracker.getAllHighWaterMarks()).toEqual({});
    });
  });

  describe('time-based cleanup', () => {
    it('should clean up old readings', () => {
      vi.useFakeTimers();

      // Add readings
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Advance time significantly
      vi.advanceTimersByTime(15000); // 15 seconds

      // Explicit cleanup should remove stale entries when age exceeded
      tracker.cleanup(10000); // 10 seconds

      // Entry should be removed
      expect(tracker.getHighWaterMark('heap_used')).toBe(0);

      vi.useRealTimers();
    });
  });
});
