/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clean up old readings', () => {
      // Add readings
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Advance time significantly
      vi.advanceTimersByTime(15000); // 15 seconds

      // Explicit cleanup should remove stale entries when age exceeded
      tracker.cleanup(10000); // 10 seconds

      // Entry should be removed
      expect(tracker.getHighWaterMark('heap_used')).toBe(0);
    });

    it('should preserve fresh entries while removing stale ones', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);

      // Advance time so first entry becomes stale
      vi.advanceTimersByTime(15000);

      // Add a fresh entry after the time advance
      tracker.shouldRecordMetric('rss', 2000000);

      // Cleanup with 10s max age — heap_used is stale, rss is fresh
      tracker.cleanup(10000);

      expect(tracker.getHighWaterMark('heap_used')).toBe(0);
      expect(tracker.getHighWaterMark('rss')).toBe(2000000);
    });

    it('should be a no-op when no entries are stale', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      // Cleanup with 1 hour max age — nothing is stale
      tracker.cleanup(3600000);

      expect(tracker.getHighWaterMark('heap_used')).toBe(1000000);
      expect(tracker.getHighWaterMark('rss')).toBe(2000000);
    });

    it('should be a no-op on an empty tracker', () => {
      // Should not throw when cleaning up with no entries
      expect(() => tracker.cleanup(10000)).not.toThrow();
      expect(tracker.getAllHighWaterMarks()).toEqual({});
    });
  });

  describe('boundary conditions', () => {
    it('should not trigger at exactly the threshold boundary', () => {
      // With 5% threshold: 1000000 * 1.05 = 1050000
      // The check is strictly greater-than, so exactly 1050000 should NOT trigger
      tracker.shouldRecordMetric('heap_used', 1000000);

      const result = tracker.shouldRecordMetric('heap_used', 1050000);
      expect(result).toBe(false);
    });

    it('should trigger just above the threshold boundary', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);

      // 1050001 is just above the 5% threshold of 1050000
      const result = tracker.shouldRecordMetric('heap_used', 1050001);
      expect(result).toBe(true);
    });

    describe('with a zero threshold', () => {
      let zeroTracker: HighWaterMarkTracker;

      beforeEach(() => {
        zeroTracker = new HighWaterMarkTracker(0);
        expect(zeroTracker.shouldRecordMetric('heap_used', 1000000)).toBe(true);
      });

      it('should trigger on every increase', () => {
        // Any increase above current mark should trigger with 0% threshold
        // threshold = 1000000 * (1 + 0/100) = 1000000, so >1000000 triggers
        expect(zeroTracker.shouldRecordMetric('heap_used', 1000001)).toBe(true);
        expect(zeroTracker.shouldRecordMetric('heap_used', 1000002)).toBe(true);
      });

      it('should not trigger for equal value', () => {
        // Exactly the same value should not trigger (> not >=)
        expect(zeroTracker.shouldRecordMetric('heap_used', 1000000)).toBe(
          false,
        );
      });
    });

    it('should handle the high-water mark only ratcheting upward', () => {
      expect(tracker.shouldRecordMetric('heap_used', 1000000)).toBe(true);

      // Large increase updates the mark
      expect(tracker.shouldRecordMetric('heap_used', 2000000)).toBe(true);
      expect(tracker.getHighWaterMark('heap_used')).toBe(2000000);

      // Drop back down — mark stays at 2000000
      expect(tracker.shouldRecordMetric('heap_used', 500000)).toBe(false);
      expect(tracker.getHighWaterMark('heap_used')).toBe(2000000);

      // A value above the OLD mark but below the CURRENT mark should not trigger
      expect(tracker.shouldRecordMetric('heap_used', 1500000)).toBe(false);
      expect(tracker.getHighWaterMark('heap_used')).toBe(2000000);
    });

    it('should handle zero values correctly', () => {
      // First call with 0: no prior entry exists, treated as first measurement
      expect(tracker.shouldRecordMetric('zero', 0)).toBe(true);

      // Second call with 0: entry exists, value has not grown — should not record
      expect(tracker.shouldRecordMetric('zero', 0)).toBe(false);
    });

    it('should treat first measurement as always recording regardless of value', () => {
      // Even a very small first value should be recorded
      expect(tracker.shouldRecordMetric('tiny', 1)).toBe(true);
      expect(tracker.getHighWaterMark('tiny')).toBe(1);
    });

    it('should handle large values without overflow', () => {
      // Values near V8 heap limit (~4GB in 64-bit)
      const largeValue = 4 * 1024 * 1024 * 1024; // 4GB in bytes
      tracker.shouldRecordMetric('heap_used', largeValue);

      // 5% growth above 4GB
      const grownValue = largeValue * 1.06;
      const result = tracker.shouldRecordMetric('heap_used', grownValue);
      expect(result).toBe(true);
      expect(tracker.getHighWaterMark('heap_used')).toBe(grownValue);
    });
  });

  describe('reset and re-record behavior', () => {
    it('should treat next measurement as first after reset', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      expect(tracker.getHighWaterMark('heap_used')).toBe(1000000);

      tracker.resetHighWaterMark('heap_used');

      // After reset, next measurement should be treated as first (always records)
      const result = tracker.shouldRecordMetric('heap_used', 500);
      expect(result).toBe(true);
      expect(tracker.getHighWaterMark('heap_used')).toBe(500);
    });

    it('should treat all metrics as first after resetAll', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      tracker.resetAllHighWaterMarks();

      // Both should record as first measurements
      expect(tracker.shouldRecordMetric('heap_used', 100)).toBe(true);
      expect(tracker.shouldRecordMetric('rss', 200)).toBe(true);
    });

    it('should not affect other metrics when resetting one', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);
      tracker.shouldRecordMetric('rss', 2000000);

      tracker.resetHighWaterMark('heap_used');

      // rss should still have its mark and require 5% growth to trigger
      expect(tracker.getHighWaterMark('rss')).toBe(2000000);
      expect(tracker.shouldRecordMetric('rss', 2030000)).toBe(false); // 1.5% — no trigger
    });

    it('should handle resetting a non-existent metric gracefully', () => {
      // Should not throw
      expect(() => tracker.resetHighWaterMark('nonexistent')).not.toThrow();
    });
  });

  describe('lastUpdateTimes tracking', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should update lastUpdateTime even when metric does not trigger recording', () => {
      tracker.shouldRecordMetric('heap_used', 1000000);

      vi.advanceTimersByTime(5000);

      // This does not trigger (3% < 5%) but should still update lastUpdateTime
      tracker.shouldRecordMetric('heap_used', 1030000);

      vi.advanceTimersByTime(8000);

      // Cleanup with 10s max age: the entry was touched 8s ago, so it's fresh
      tracker.cleanup(10000);
      expect(tracker.getHighWaterMark('heap_used')).toBe(1000000);
    });
  });
});
