/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ActivityDetector,
  getActivityDetector,
  recordUserActivity,
  isUserActive,
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
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('should update last activity time', () => {
      const beforeTime = detector.getLastActivityTime();
      vi.advanceTimersByTime(100);

      detector.recordActivity();
      const afterTime = detector.getLastActivityTime();

      expect(afterTime).toBeGreaterThan(beforeTime);
    });
  });

  describe('isUserActive', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('should return true immediately after construction', () => {
      expect(detector.isUserActive()).toBe(true);
    });

    it('should return true within idle threshold', () => {
      detector.recordActivity();
      expect(detector.isUserActive()).toBe(true);
    });

    it('should return false after idle threshold', () => {
      // Advance time beyond idle threshold
      vi.advanceTimersByTime(2000); // 2 seconds, threshold is 1 second

      expect(detector.isUserActive()).toBe(false);
    });

    it('should return true again after recording new activity', () => {
      // Go idle
      vi.advanceTimersByTime(2000);
      expect(detector.isUserActive()).toBe(false);

      // Record new activity
      detector.recordActivity();
      expect(detector.isUserActive()).toBe(true);
    });
  });

  describe('getTimeSinceLastActivity', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('should return time elapsed since last activity', () => {
      detector.recordActivity();
      vi.advanceTimersByTime(500);

      const timeSince = detector.getTimeSinceLastActivity();
      expect(timeSince).toBe(500);
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
  describe('global instance', () => {
    it('should expose a global ActivityDetector via getActivityDetector', () => {
      const detector = getActivityDetector();
      expect(detector).toBeInstanceOf(ActivityDetector);
    });
  });

  describe('getActivityDetector', () => {
    it('should always return the global instance', () => {
      const detector = getActivityDetector();
      const detectorAgain = getActivityDetector();
      expect(detectorAgain).toBe(detector);
    });
  });

  describe('recordUserActivity', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('should record activity on existing detector', () => {
      const detector = getActivityDetector();
      const beforeTime = detector.getLastActivityTime();
      vi.advanceTimersByTime(100);

      recordUserActivity();

      const afterTime = detector.getLastActivityTime();
      expect(afterTime).toBeGreaterThan(beforeTime);
    });
  });

  describe('isUserActive', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('should reflect global detector state', () => {
      expect(isUserActive()).toBe(true);
      // Default idle threshold is 30s; advance beyond it
      vi.advanceTimersByTime(31000);
      expect(isUserActive()).toBe(false);
    });
  });
});
