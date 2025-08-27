/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ActivityDetector,
  initializeActivityDetector,
  getActivityDetector,
  recordUserActivity,
  isUserActive,
  resetGlobalActivityDetector,
} from './activity-detector.js';

describe('ActivityDetector', () => {
  let detector: ActivityDetector;

  beforeEach(() => {
    detector = new ActivityDetector(1000); // 1 second idle threshold for testing
  });

  describe('constructor', () => {
    it('should initialize with default idle threshold', () => {
      const defaultDetector = new ActivityDetector();
      expect(defaultDetector).toBeInstanceOf(ActivityDetector);
    });

    it('should initialize with custom idle threshold', () => {
      const customDetector = new ActivityDetector(5000);
      expect(customDetector).toBeInstanceOf(ActivityDetector);
    });
  });

  describe('recordActivity', () => {
    it('should update last activity time', () => {
      const beforeTime = detector.getLastActivityTime();

      // Wait a small amount to ensure time difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      detector.recordActivity();
      const afterTime = detector.getLastActivityTime();

      expect(afterTime).toBeGreaterThan(beforeTime);
      vi.useRealTimers();
    });
  });

  describe('isUserActive', () => {
    it('should return true immediately after construction', () => {
      expect(detector.isUserActive()).toBe(true);
    });

    it('should return true within idle threshold', () => {
      detector.recordActivity();
      expect(detector.isUserActive()).toBe(true);
    });

    it('should return false after idle threshold', () => {
      vi.useFakeTimers();

      // Advance time beyond idle threshold
      vi.advanceTimersByTime(2000); // 2 seconds, threshold is 1 second

      expect(detector.isUserActive()).toBe(false);

      vi.useRealTimers();
    });

    it('should return true again after recording new activity', () => {
      vi.useFakeTimers();

      // Go idle
      vi.advanceTimersByTime(2000);
      expect(detector.isUserActive()).toBe(false);

      // Record new activity
      detector.recordActivity();
      expect(detector.isUserActive()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('getTimeSinceLastActivity', () => {
    it('should return time elapsed since last activity', () => {
      vi.useFakeTimers();

      detector.recordActivity();
      vi.advanceTimersByTime(500);

      const timeSince = detector.getTimeSinceLastActivity();
      expect(timeSince).toBe(500);

      vi.useRealTimers();
    });
  });

  describe('getLastActivityTime', () => {
    it('should return the timestamp of last activity', () => {
      const before = Date.now();
      detector.recordActivity();
      const activityTime = detector.getLastActivityTime();
      const after = Date.now();

      expect(activityTime).toBeGreaterThanOrEqual(before);
      expect(activityTime).toBeLessThanOrEqual(after);
    });
  });
});

describe('Global Activity Detector Functions', () => {
  beforeEach(() => {
    // Reset global instance
    resetGlobalActivityDetector();
  });

  describe('initializeActivityDetector', () => {
    it('should create and return a global instance', () => {
      const detector = initializeActivityDetector();
      expect(detector).toBeInstanceOf(ActivityDetector);
    });

    it('should return same instance on multiple calls', () => {
      const detector1 = initializeActivityDetector();
      const detector2 = initializeActivityDetector();
      expect(detector1).toBe(detector2);
    });

    it('should accept custom idle threshold', () => {
      const detector = initializeActivityDetector(5000);
      expect(detector).toBeInstanceOf(ActivityDetector);
    });
  });

  describe('getActivityDetector', () => {
    it('should return null when not initialized', () => {
      expect(getActivityDetector()).toBeNull();
    });

    it('should return initialized instance', () => {
      const detector = initializeActivityDetector();
      expect(getActivityDetector()).toBe(detector);
    });
  });

  describe('recordUserActivity', () => {
    it('should initialize detector if not exists', () => {
      expect(getActivityDetector()).toBeNull();

      recordUserActivity();

      expect(getActivityDetector()).toBeInstanceOf(ActivityDetector);
    });

    it('should record activity on existing detector', () => {
      const detector = initializeActivityDetector();
      const beforeTime = detector.getLastActivityTime();

      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      recordUserActivity();

      const afterTime = detector.getLastActivityTime();
      expect(afterTime).toBeGreaterThan(beforeTime);

      vi.useRealTimers();
    });
  });

  describe('isUserActive', () => {
    it('should return false when no detector exists', () => {
      expect(isUserActive()).toBe(false);
    });

    it('should return detector state when exists', () => {
      initializeActivityDetector(1000);
      expect(isUserActive()).toBe(true);

      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);

      expect(isUserActive()).toBe(false);

      vi.useRealTimers();
    });
  });
});
