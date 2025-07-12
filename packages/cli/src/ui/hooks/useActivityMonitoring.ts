/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import {
  recordUserActivity,
  Config,
  getActivityMonitor,
  startGlobalActivityMonitoring,
  stopGlobalActivityMonitoring,
} from '@google/gemini-cli-core';

/**
 * Options for the activity monitoring hook
 */
export interface UseActivityMonitoringOptions {
  /** Whether to enable activity monitoring */
  enabled?: boolean;
}

/**
 * Statistics returned by activity monitoring
 */
export interface ActivityStats {
  totalEvents: number;
  eventTypes: Record<string, number>;
  timeRange: { start: number; end: number } | null;
}

/**
 * Return type for the activity monitoring hook
 */
export interface UseActivityMonitoringReturn {
  /** Record a user activity event */
  recordActivity: (
    type: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ) => void;
  /** Check if activity monitoring is active */
  isActive: boolean;
  /** Start activity monitoring */
  startMonitoring: () => void;
  /** Stop activity monitoring */
  stopMonitoring: () => void;
  /** Get activity statistics */
  getStats: () => ActivityStats;
}

/**
 * Hook for managing user activity monitoring
 *
 * This hook provides a simplified interface for recording user activities
 * that can be used by the memory monitoring system to determine when
 * the application is in active use.
 */
export function useActivityMonitoring(
  config: Config,
  options: UseActivityMonitoringOptions = {},
): UseActivityMonitoringReturn {
  const { enabled = true } = options;

  // Record activity callback
  const recordActivity = useCallback(
    (_type: string, _context?: string, _metadata?: Record<string, unknown>) => {
      if (enabled) {
        recordUserActivity();
      }
    },
    [enabled],
  );

  // Start monitoring callback (simplified - activity detection is always on)
  const startMonitoring = useCallback(() => {
    // Activity monitoring is always active when enabled
    if (enabled) {
      startGlobalActivityMonitoring(config);
      recordUserActivity(); // Record initial activity
    }
  }, [enabled, config]);

  // Stop monitoring callback (simplified)
  const stopMonitoring = useCallback(() => {
    // Stop global activity monitoring
    if (enabled) {
      stopGlobalActivityMonitoring();
    }
  }, [enabled]);

  // Get stats callback (simplified)
  const getStats = useCallback((): ActivityStats => {
    // Get stats from global activity monitor
    const monitor = getActivityMonitor();
    if (monitor) {
      return monitor.getActivityStats();
    }
    return {
      totalEvents: 0,
      eventTypes: {},
      timeRange: null,
    };
  }, []);

  return {
    recordActivity,
    isActive: enabled,
    startMonitoring,
    stopMonitoring,
    getStats,
  };
}

/**
 * Simplified activity recorder hook
 * Provides convenient functions for recording specific activity types
 */
export function useActivityRecorder(_config: Config, enabled: boolean = true) {
  return {
    recordUserInput: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordUserInputEnd: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordMessageAdded: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordToolCall: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordStreamStart: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordStreamEnd: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
    recordHistoryUpdate: useCallback(() => {
      if (enabled) recordUserActivity();
    }, [enabled]),
  };
}
