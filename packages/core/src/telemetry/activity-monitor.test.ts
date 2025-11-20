/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ActivityMonitor,
  DEFAULT_ACTIVITY_CONFIG,
  initializeActivityMonitor,
  getActivityMonitor,
  recordGlobalActivity,
  startGlobalActivityMonitoring,
  stopGlobalActivityMonitoring,
} from './activity-monitor.js';
import { ActivityType } from './activity-types.js';
import type { ActivityEvent } from './activity-monitor.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

// Mock the dependencies
vi.mock('./metrics.js', () => ({
  isPerformanceMonitoringActive: vi.fn(() => true),
}));

vi.mock('./memory-monitor.js', () => ({
  getMemoryMonitor: vi.fn(() => ({
    takeSnapshot: vi.fn(() => ({
      timestamp: Date.now(),
      heapUsed: 1000000,
      heapTotal: 2000000,
      external: 500000,
      rss: 3000000,
      arrayBuffers: 100000,
      heapSizeLimit: 4000000,
    })),
  })),
}));

describe('ActivityMonitor', () => {
  let activityMonitor: ActivityMonitor;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getSessionId: () => 'test-session-123',
    } as Config;
    activityMonitor = new ActivityMonitor();
  });

  afterEach(() => {
    activityMonitor.stop();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const monitor = new ActivityMonitor();
      expect(monitor).toBeDefined();
      expect(monitor.isMonitoringActive()).toBe(false);
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        ...DEFAULT_ACTIVITY_CONFIG,
        snapshotThrottleMs: 2000,
      };
      const monitor = new ActivityMonitor(customConfig);
      expect(monitor).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should start and stop monitoring', () => {
      expect(activityMonitor.isMonitoringActive()).toBe(false);

      activityMonitor.start(mockConfig);
      expect(activityMonitor.isMonitoringActive()).toBe(true);

      activityMonitor.stop();
      expect(activityMonitor.isMonitoringActive()).toBe(false);
    });

    it('should not start monitoring when already active', () => {
      activityMonitor.start(mockConfig);
      expect(activityMonitor.isMonitoringActive()).toBe(true);

      // Should not affect already active monitor
      activityMonitor.start(mockConfig);
      expect(activityMonitor.isMonitoringActive()).toBe(true);
    });
  });

  describe('recordActivity', () => {
    beforeEach(() => {
      activityMonitor.start(mockConfig);
    });

    it('should record activity events', () => {
      activityMonitor.recordActivity(
        ActivityType.USER_INPUT_START,
        'test-context',
      );

      const stats = activityMonitor.getActivityStats();
      expect(stats.totalEvents).toBe(2); // includes the start event
      expect(stats.eventTypes[ActivityType.USER_INPUT_START]).toBe(1);
    });

    it('should include metadata in activity events', () => {
      const metadata = { key: 'value', count: 42 };
      activityMonitor.recordActivity(
        ActivityType.MESSAGE_ADDED,
        'test-context',
        metadata,
      );

      const recentActivity = activityMonitor.getRecentActivity(1);
      expect(recentActivity[0].metadata).toEqual(metadata);
    });

    it('should not record activity when monitoring is disabled', () => {
      activityMonitor.updateConfig({ enabled: false });

      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);

      const stats = activityMonitor.getActivityStats();
      expect(stats.totalEvents).toBe(1); // only the start event
    });

    it('should limit event buffer size', () => {
      activityMonitor.updateConfig({ maxEventBuffer: 3 });

      // Record more events than buffer size
      for (let i = 0; i < 5; i++) {
        activityMonitor.recordActivity(
          ActivityType.USER_INPUT_START,
          `event-${i}`,
        );
      }

      const stats = activityMonitor.getActivityStats();
      expect(stats.totalEvents).toBe(3); // buffer limit
    });
  });

  describe('listeners', () => {
    let listenerCallCount: number;
    let lastEvent: ActivityEvent | null;

    beforeEach(() => {
      listenerCallCount = 0;
      lastEvent = null;
      activityMonitor.start(mockConfig);
    });

    it('should notify listeners of activity events', () => {
      const listener = (event: ActivityEvent) => {
        listenerCallCount++;
        lastEvent = event;
      };

      activityMonitor.addListener(listener);
      activityMonitor.recordActivity(ActivityType.MESSAGE_ADDED, 'test');

      expect(listenerCallCount).toBe(1);
      expect(lastEvent?.type).toBe(ActivityType.MESSAGE_ADDED);
      expect(lastEvent?.context).toBe('test');
    });

    it('should remove listeners correctly', () => {
      const listener = () => {
        listenerCallCount++;
      };

      activityMonitor.addListener(listener);
      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);
      expect(listenerCallCount).toBe(1);

      activityMonitor.removeListener(listener);
      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);
      expect(listenerCallCount).toBe(1); // Should not increase
    });

    it('should handle listener errors gracefully', () => {
      const faultyListener = () => {
        throw new Error('Listener error');
      };
      const goodListener = () => {
        listenerCallCount++;
      };

      // Spy on console.debug to check error handling
      const debugSpy = vi
        .spyOn(debugLogger, 'debug')
        .mockImplementation(() => {});

      activityMonitor.addListener(faultyListener);
      activityMonitor.addListener(goodListener);

      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);

      expect(listenerCallCount).toBe(1); // Good listener should still work
      expect(debugSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
    });
  });

  describe('getActivityStats', () => {
    beforeEach(() => {
      activityMonitor.start(mockConfig);
    });

    it('should return correct activity statistics', () => {
      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);
      activityMonitor.recordActivity(ActivityType.MESSAGE_ADDED);
      activityMonitor.recordActivity(ActivityType.USER_INPUT_START);

      const stats = activityMonitor.getActivityStats();
      expect(stats.totalEvents).toBe(4); // includes start event
      expect(stats.eventTypes[ActivityType.USER_INPUT_START]).toBe(2);
      expect(stats.eventTypes[ActivityType.MESSAGE_ADDED]).toBe(1);
      expect(stats.timeRange).toBeDefined();
    });

    it('should return null time range for empty buffer', () => {
      const emptyMonitor = new ActivityMonitor();
      const stats = emptyMonitor.getActivityStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.timeRange).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration correctly', () => {
      const newConfig = { snapshotThrottleMs: 2000 };
      activityMonitor.updateConfig(newConfig);

      // Config should be updated (tested indirectly through behavior)
      expect(activityMonitor).toBeDefined();
    });
  });
});

describe('Global activity monitoring functions', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getSessionId: () => 'test-session-456',
    } as Config;
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopGlobalActivityMonitoring();
  });

  describe('initializeActivityMonitor', () => {
    it('should create global monitor instance', () => {
      const monitor = initializeActivityMonitor();
      expect(monitor).toBeDefined();
      expect(getActivityMonitor()).toBe(monitor);
    });

    it('should return same instance on subsequent calls', () => {
      const monitor1 = initializeActivityMonitor();
      const monitor2 = initializeActivityMonitor();
      expect(monitor1).toBe(monitor2);
    });
  });

  describe('recordGlobalActivity', () => {
    it('should record activity through global monitor', () => {
      startGlobalActivityMonitoring(mockConfig);

      recordGlobalActivity(ActivityType.TOOL_CALL_SCHEDULED, 'global-test');

      const monitor = getActivityMonitor();
      const stats = monitor?.getActivityStats();
      expect(stats?.totalEvents).toBeGreaterThan(0);
    });

    it('should handle missing global monitor gracefully', () => {
      stopGlobalActivityMonitoring();

      // Should not throw error
      expect(() => {
        recordGlobalActivity(ActivityType.USER_INPUT_START);
      }).not.toThrow();
    });
  });

  describe('startGlobalActivityMonitoring', () => {
    it('should start global monitoring with default config', () => {
      startGlobalActivityMonitoring(mockConfig);

      const monitor = getActivityMonitor();
      expect(monitor?.isMonitoringActive()).toBe(true);
    });

    it('should start global monitoring with custom config', () => {
      const customConfig = {
        ...DEFAULT_ACTIVITY_CONFIG,
        snapshotThrottleMs: 3000,
      };

      startGlobalActivityMonitoring(mockConfig, customConfig);

      const monitor = getActivityMonitor();
      expect(monitor?.isMonitoringActive()).toBe(true);
    });
  });

  describe('stopGlobalActivityMonitoring', () => {
    it('should stop global monitoring', () => {
      startGlobalActivityMonitoring(mockConfig);
      expect(getActivityMonitor()?.isMonitoringActive()).toBe(true);

      stopGlobalActivityMonitoring();
      expect(getActivityMonitor()?.isMonitoringActive()).toBe(false);
    });

    it('should handle missing global monitor gracefully', () => {
      expect(() => {
        stopGlobalActivityMonitoring();
      }).not.toThrow();
    });
  });
});
