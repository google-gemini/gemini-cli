/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(1000); // 1 second interval for testing
  });

  describe('constructor', () => {
    it('should initialize with default interval', () => {
      const defaultLimiter = new RateLimiter();
      expect(defaultLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should initialize with custom interval', () => {
      const customLimiter = new RateLimiter(5000);
      expect(customLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should throw on negative interval', () => {
      expect(() => new RateLimiter(-1)).toThrow(
        'minIntervalMs must be non-negative.',
      );
    });
  });

  describe('shouldRecord', () => {
    it('should allow first recording', () => {
      const result = rateLimiter.shouldRecord('test_metric');
      expect(result).toBe(true);
    });

    it('should block immediate subsequent recordings', () => {
      rateLimiter.shouldRecord('test_metric'); // First call
      const result = rateLimiter.shouldRecord('test_metric'); // Immediate second call
      expect(result).toBe(false);
    });

    it('should allow recording after interval', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric'); // First call

      // Advance time past interval
      vi.advanceTimersByTime(1500);

      const result = rateLimiter.shouldRecord('test_metric');
      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('should handle different metric keys independently', () => {
      rateLimiter.shouldRecord('metric_a'); // First call for metric_a

      const resultA = rateLimiter.shouldRecord('metric_a'); // Second call for metric_a
      const resultB = rateLimiter.shouldRecord('metric_b'); // First call for metric_b

      expect(resultA).toBe(false); // Should be blocked
      expect(resultB).toBe(true); // Should be allowed
    });

    it('should use shorter interval for high priority events', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric', true); // High priority

      // Advance time by half the normal interval
      vi.advanceTimersByTime(500);

      const result = rateLimiter.shouldRecord('test_metric', true);
      expect(result).toBe(true); // Should be allowed due to high priority

      vi.useRealTimers();
    });

    it('should still block high priority events if interval not met', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric', true); // High priority

      // Advance time by less than half interval
      vi.advanceTimersByTime(300);

      const result = rateLimiter.shouldRecord('test_metric', true);
      expect(result).toBe(false); // Should still be blocked

      vi.useRealTimers();
    });
  });

  describe('forceRecord', () => {
    it('should update last record time', () => {
      const before = rateLimiter.getTimeUntilNextAllowed('test_metric');

      rateLimiter.forceRecord('test_metric');

      const after = rateLimiter.getTimeUntilNextAllowed('test_metric');
      expect(after).toBeGreaterThan(before);
    });

    it('should block subsequent recordings after force record', () => {
      rateLimiter.forceRecord('test_metric');

      const result = rateLimiter.shouldRecord('test_metric');
      expect(result).toBe(false);
    });
  });

  describe('getTimeUntilNextAllowed', () => {
    it('should return 0 for new metric', () => {
      const time = rateLimiter.getTimeUntilNextAllowed('new_metric');
      expect(time).toBe(0);
    });

    it('should return correct time after recording', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric');

      // Advance time partially
      vi.advanceTimersByTime(300);

      const timeRemaining = rateLimiter.getTimeUntilNextAllowed('test_metric');
      expect(timeRemaining).toBeCloseTo(700, -1); // Approximately 700ms remaining

      vi.useRealTimers();
    });

    it('should return 0 after interval has passed', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric');

      // Advance time past interval
      vi.advanceTimersByTime(1500);

      const timeRemaining = rateLimiter.getTimeUntilNextAllowed('test_metric');
      expect(timeRemaining).toBe(0);

      vi.useRealTimers();
    });

    it('should account for high priority interval', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('hp_metric', true);

      // After 300ms, with 1000ms base interval, half rounded is 500ms
      vi.advanceTimersByTime(300);

      const timeRemaining = rateLimiter.getTimeUntilNextAllowed(
        'hp_metric',
        true,
      );
      expect(timeRemaining).toBeCloseTo(200, -1);

      vi.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const stats = rateLimiter.getStats();
      expect(stats).toEqual({
        totalMetrics: 0,
        oldestRecord: 0,
        newestRecord: 0,
        averageInterval: 0,
      });
    });

    it('should return correct stats after recordings', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('metric_a');
      vi.advanceTimersByTime(500);
      rateLimiter.shouldRecord('metric_b');
      vi.advanceTimersByTime(500);
      rateLimiter.shouldRecord('metric_c');

      const stats = rateLimiter.getStats();
      expect(stats.totalMetrics).toBe(3);
      expect(stats.averageInterval).toBeCloseTo(500, -1);

      vi.useRealTimers();
    });

    it('should handle single recording correctly', () => {
      rateLimiter.shouldRecord('test_metric');

      const stats = rateLimiter.getStats();
      expect(stats.totalMetrics).toBe(1);
      expect(stats.averageInterval).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all rate limiting state', () => {
      rateLimiter.shouldRecord('metric_a');
      rateLimiter.shouldRecord('metric_b');

      rateLimiter.reset();

      const stats = rateLimiter.getStats();
      expect(stats.totalMetrics).toBe(0);

      // Should allow immediate recording after reset
      const result = rateLimiter.shouldRecord('metric_a');
      expect(result).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove old entries', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('old_metric');

      // Advance time beyond cleanup threshold
      vi.advanceTimersByTime(4000000); // More than 1 hour

      rateLimiter.cleanup(3600000); // 1 hour cleanup

      // Should allow immediate recording of old metric after cleanup
      const result = rateLimiter.shouldRecord('old_metric');
      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('should preserve recent entries', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('recent_metric');

      // Advance time but not beyond cleanup threshold
      vi.advanceTimersByTime(1800000); // 30 minutes

      rateLimiter.cleanup(3600000); // 1 hour cleanup

      // Should no longer be rate limited after 30 minutes (way past 1 minute default interval)
      const result = rateLimiter.shouldRecord('recent_metric');
      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it('should use default cleanup age', () => {
      vi.useFakeTimers();

      rateLimiter.shouldRecord('test_metric');

      // Advance time beyond default cleanup (1 hour)
      vi.advanceTimersByTime(4000000);

      rateLimiter.cleanup(); // Use default age

      const result = rateLimiter.shouldRecord('test_metric');
      expect(result).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle zero interval', () => {
      const zeroLimiter = new RateLimiter(0);

      zeroLimiter.shouldRecord('test_metric');
      const result = zeroLimiter.shouldRecord('test_metric');

      expect(result).toBe(true); // Should allow with zero interval
    });

    it('should handle very large intervals', () => {
      const longLimiter = new RateLimiter(Number.MAX_SAFE_INTEGER);

      longLimiter.shouldRecord('test_metric');
      const timeRemaining = longLimiter.getTimeUntilNextAllowed('test_metric');

      expect(timeRemaining).toBeGreaterThan(1000000);
    });
  });
});
