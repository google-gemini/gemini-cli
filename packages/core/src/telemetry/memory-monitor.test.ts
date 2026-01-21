/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import process from 'node:process';
import {
  MemoryMonitor,
  initializeMemoryMonitor,
  getMemoryMonitor,
  recordCurrentMemoryUsage,
  startGlobalMemoryMonitoring,
  stopGlobalMemoryMonitoring,
  _resetGlobalMemoryMonitorForTests,
} from './memory-monitor.js';
import type { Config } from '../config/config.js';
import { recordMemoryUsage, isPerformanceMonitoringActive } from './metrics.js';
import { HighWaterMarkTracker } from './high-water-mark-tracker.js';
import { RateLimiter } from './rate-limiter.js';

// Mock dependencies
vi.mock('./metrics.js', () => ({
  recordMemoryUsage: vi.fn(),
  isPerformanceMonitoringActive: vi.fn(),
  MemoryMetricType: {
    HEAP_USED: 'heap_used',
    HEAP_TOTAL: 'heap_total',
    EXTERNAL: 'external',
    RSS: 'rss',
  },
}));

// Mock Node.js modules
vi.mock('node:v8', () => ({
  default: {
    getHeapStatistics: vi.fn(),
    getHeapSpaceStatistics: vi.fn(),
  },
}));

vi.mock('node:process', () => ({
  default: {
    memoryUsage: vi.fn(),
    cpuUsage: vi.fn(),
    uptime: vi.fn(),
  },
}));

const mockRecordMemoryUsage = vi.mocked(recordMemoryUsage);
const mockIsPerformanceMonitoringActive = vi.mocked(
  isPerformanceMonitoringActive,
);
const mockV8GetHeapStatistics = vi.mocked(v8.getHeapStatistics);
const mockV8GetHeapSpaceStatistics = vi.mocked(v8.getHeapSpaceStatistics);
const mockProcessMemoryUsage = vi.mocked(process.memoryUsage);
const mockProcessCpuUsage = vi.mocked(process.cpuUsage);
const mockProcessUptime = vi.mocked(process.uptime);

// Mock config object
const mockConfig = {
  getSessionId: () => 'test-session-id',
  getTelemetryEnabled: () => true,
} as unknown as Config;

// Test data
const mockMemoryUsage = {
  heapUsed: 15728640, // ~15MB
  heapTotal: 31457280, // ~30MB
  external: 2097152, // ~2MB
  rss: 41943040, // ~40MB
  arrayBuffers: 1048576, // ~1MB
};

const mockHeapStatistics = {
  heap_size_limit: 536870912, // ~512MB
  total_heap_size: 31457280,
  total_heap_size_executable: 4194304, // ~4MB
  total_physical_size: 31457280,
  total_available_size: 1000000000, // ~1GB
  used_heap_size: 15728640,
  malloced_memory: 8192,
  peak_malloced_memory: 16384,
  does_zap_garbage: 0 as v8.DoesZapCodeSpaceFlag,
  number_of_native_contexts: 1,
  number_of_detached_contexts: 0,
  total_global_handles_size: 8192,
  used_global_handles_size: 4096,
  external_memory: 2097152,
};

const mockHeapSpaceStatistics = [
  {
    space_name: 'new_space',
    space_size: 8388608,
    space_used_size: 4194304,
    space_available_size: 4194304,
    physical_space_size: 8388608,
  },
  {
    space_name: 'old_space',
    space_size: 16777216,
    space_used_size: 8388608,
    space_available_size: 8388608,
    physical_space_size: 16777216,
  },
];

const mockCpuUsage = {
  user: 1000000, // 1 second
  system: 500000, // 0.5 seconds
};

describe('MemoryMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    // Setup default mocks
    mockIsPerformanceMonitoringActive.mockReturnValue(true);
    mockProcessMemoryUsage.mockReturnValue(mockMemoryUsage);
    mockV8GetHeapStatistics.mockReturnValue(mockHeapStatistics);
    mockV8GetHeapSpaceStatistics.mockReturnValue(mockHeapSpaceStatistics);
    mockProcessCpuUsage.mockReturnValue(mockCpuUsage);
    mockProcessUptime.mockReturnValue(123.456);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    _resetGlobalMemoryMonitorForTests();
  });

  describe('MemoryMonitor Class', () => {
    describe('constructor', () => {
      it('should create a new MemoryMonitor instance without config to avoid multi-session attribution', () => {
        const monitor = new MemoryMonitor();
        expect(monitor).toBeInstanceOf(MemoryMonitor);
      });
    });

    describe('takeSnapshot', () => {
      it('should take a memory snapshot and record metrics when performance monitoring is active', () => {
        const monitor = new MemoryMonitor();

        const snapshot = monitor.takeSnapshot('test_context', mockConfig);

        expect(snapshot).toEqual({
          timestamp: Date.now(),
          heapUsed: mockMemoryUsage.heapUsed,
          heapTotal: mockMemoryUsage.heapTotal,
          external: mockMemoryUsage.external,
          rss: mockMemoryUsage.rss,
          arrayBuffers: mockMemoryUsage.arrayBuffers,
          heapSizeLimit: mockHeapStatistics.heap_size_limit,
        });

        // Verify metrics were recorded
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'test_context',
          },
        );
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapTotal,
          {
            memory_type: 'heap_total',
            component: 'test_context',
          },
        );
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.external,
          {
            memory_type: 'external',
            component: 'test_context',
          },
        );
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.rss,
          {
            memory_type: 'rss',
            component: 'test_context',
          },
        );
      });

      it('should not record metrics when performance monitoring is inactive', () => {
        mockIsPerformanceMonitoringActive.mockReturnValue(false);
        const monitor = new MemoryMonitor();

        const snapshot = monitor.takeSnapshot('test_context', mockConfig);

        expect(snapshot).toEqual({
          timestamp: Date.now(),
          heapUsed: mockMemoryUsage.heapUsed,
          heapTotal: mockMemoryUsage.heapTotal,
          external: mockMemoryUsage.external,
          rss: mockMemoryUsage.rss,
          arrayBuffers: mockMemoryUsage.arrayBuffers,
          heapSizeLimit: mockHeapStatistics.heap_size_limit,
        });

        // Verify no metrics were recorded
        expect(mockRecordMemoryUsage).not.toHaveBeenCalled();
      });
    });

    describe('getCurrentMemoryUsage', () => {
      it('should return current memory usage without recording metrics', () => {
        const monitor = new MemoryMonitor();

        const usage = monitor.getCurrentMemoryUsage();

        expect(usage).toEqual({
          timestamp: Date.now(),
          heapUsed: mockMemoryUsage.heapUsed,
          heapTotal: mockMemoryUsage.heapTotal,
          external: mockMemoryUsage.external,
          rss: mockMemoryUsage.rss,
          arrayBuffers: mockMemoryUsage.arrayBuffers,
          heapSizeLimit: mockHeapStatistics.heap_size_limit,
        });

        // Verify no metrics were recorded
        expect(mockRecordMemoryUsage).not.toHaveBeenCalled();
      });
    });

    describe('start and stop', () => {
      it('should start and stop memory monitoring with proper lifecycle', () => {
        const monitor = new MemoryMonitor();
        const intervalMs = 1000;

        // Start monitoring
        monitor.start(mockConfig, intervalMs);

        // Verify initial snapshot was taken
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'monitoring_start',
          },
        );

        // Fast-forward time to trigger periodic snapshot
        vi.advanceTimersByTime(intervalMs);

        // Verify monitoring_start snapshot was taken (multiple metrics)
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          expect.any(Number),
          {
            memory_type: 'heap_used',
            component: 'monitoring_start',
          },
        );

        // Stop monitoring
        monitor.stop(mockConfig);

        // Verify final snapshot was taken
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'monitoring_stop',
          },
        );
      });

      it('should not start monitoring when performance monitoring is inactive', () => {
        mockIsPerformanceMonitoringActive.mockReturnValue(false);
        const monitor = new MemoryMonitor();

        monitor.start(mockConfig, 1000);

        // Verify no snapshots were taken
        expect(mockRecordMemoryUsage).not.toHaveBeenCalled();
      });

      it('should not start monitoring when already running', () => {
        const monitor = new MemoryMonitor();

        // Start monitoring twice
        monitor.start(mockConfig, 1000);
        const initialCallCount = mockRecordMemoryUsage.mock.calls.length;

        monitor.start(mockConfig, 1000);

        // Verify no additional snapshots were taken
        expect(mockRecordMemoryUsage).toHaveBeenCalledTimes(initialCallCount);
      });

      it('should handle stop when not running', () => {
        const monitor = new MemoryMonitor();

        // Should not throw error
        expect(() => monitor.stop(mockConfig)).not.toThrow();
      });

      it('should stop without taking final snapshot when no config provided', () => {
        const monitor = new MemoryMonitor();

        monitor.start(mockConfig, 1000);
        const callsBeforeStop = mockRecordMemoryUsage.mock.calls.length;

        monitor.stop(); // No config provided

        // Verify no final snapshot was taken
        expect(mockRecordMemoryUsage).toHaveBeenCalledTimes(callsBeforeStop);
      });

      it('should periodically cleanup tracker state to prevent growth', () => {
        const trackerCleanupSpy = vi.spyOn(
          HighWaterMarkTracker.prototype,
          'cleanup',
        );
        const rateLimiterCleanupSpy = vi.spyOn(
          RateLimiter.prototype,
          'cleanup',
        );

        const monitor = new MemoryMonitor();
        monitor.start(mockConfig, 1000);

        trackerCleanupSpy.mockClear();
        rateLimiterCleanupSpy.mockClear();

        // Advance timers beyond the cleanup interval (15 minutes) to trigger cleanup
        vi.advanceTimersByTime(16 * 60 * 1000);

        expect(trackerCleanupSpy).toHaveBeenCalled();
        expect(rateLimiterCleanupSpy).toHaveBeenCalled();

        monitor.stop(mockConfig);

        trackerCleanupSpy.mockRestore();
        rateLimiterCleanupSpy.mockRestore();
      });
    });

    describe('getMemoryGrowth', () => {
      it('should calculate memory growth between snapshots', () => {
        const monitor = new MemoryMonitor();

        // Take initial snapshot
        monitor.takeSnapshot('initial', mockConfig);

        // Change memory usage
        const newMemoryUsage = {
          ...mockMemoryUsage,
          heapUsed: mockMemoryUsage.heapUsed + 1048576, // +1MB
          rss: mockMemoryUsage.rss + 2097152, // +2MB
        };
        mockProcessMemoryUsage.mockReturnValue(newMemoryUsage);

        const growth = monitor.getMemoryGrowth();

        expect(growth).toEqual({
          heapUsed: 1048576,
          heapTotal: 0,
          external: 0,
          rss: 2097152,
          arrayBuffers: 0,
        });
      });

      it('should return null when no previous snapshot exists', () => {
        const monitor = new MemoryMonitor();

        const growth = monitor.getMemoryGrowth();

        expect(growth).toBeNull();
      });
    });

    describe('checkMemoryThreshold', () => {
      it('should return true when memory usage exceeds threshold', () => {
        const monitor = new MemoryMonitor();
        const thresholdMB = 10; // 10MB threshold

        const exceeds = monitor.checkMemoryThreshold(thresholdMB);

        expect(exceeds).toBe(true); // heapUsed is ~15MB
      });

      it('should return false when memory usage is below threshold', () => {
        const monitor = new MemoryMonitor();
        const thresholdMB = 20; // 20MB threshold

        const exceeds = monitor.checkMemoryThreshold(thresholdMB);

        expect(exceeds).toBe(false); // heapUsed is ~15MB
      });
    });

    describe('getMemoryUsageSummary', () => {
      it('should return memory usage summary in MB with proper rounding', () => {
        const monitor = new MemoryMonitor();

        const summary = monitor.getMemoryUsageSummary();

        expect(summary).toEqual({
          heapUsedMB: 15.0, // 15728640 bytes = 15MB
          heapTotalMB: 30.0, // 31457280 bytes = 30MB
          externalMB: 2.0, // 2097152 bytes = 2MB
          rssMB: 40.0, // 41943040 bytes = 40MB
          heapSizeLimitMB: 512.0, // 536870912 bytes = 512MB
        });
      });
    });

    describe('getHeapStatistics', () => {
      it('should return V8 heap statistics', () => {
        const monitor = new MemoryMonitor();

        const stats = monitor.getHeapStatistics();

        expect(stats).toBe(mockHeapStatistics);
        expect(mockV8GetHeapStatistics).toHaveBeenCalled();
      });
    });

    describe('getHeapSpaceStatistics', () => {
      it('should return V8 heap space statistics', () => {
        const monitor = new MemoryMonitor();

        const stats = monitor.getHeapSpaceStatistics();

        expect(stats).toBe(mockHeapSpaceStatistics);
        expect(mockV8GetHeapSpaceStatistics).toHaveBeenCalled();
      });
    });

    describe('getProcessMetrics', () => {
      it('should return process CPU and memory metrics', () => {
        const monitor = new MemoryMonitor();

        const metrics = monitor.getProcessMetrics();

        expect(metrics).toEqual({
          cpuUsage: mockCpuUsage,
          memoryUsage: mockMemoryUsage,
          uptime: 123.456,
        });
      });
    });

    describe('recordComponentMemoryUsage', () => {
      it('should record memory usage for specific component', () => {
        const monitor = new MemoryMonitor();

        const snapshot = monitor.recordComponentMemoryUsage(
          mockConfig,
          'test_component',
        );

        expect(snapshot).toEqual({
          timestamp: Date.now(),
          heapUsed: mockMemoryUsage.heapUsed,
          heapTotal: mockMemoryUsage.heapTotal,
          external: mockMemoryUsage.external,
          rss: mockMemoryUsage.rss,
          arrayBuffers: mockMemoryUsage.arrayBuffers,
          heapSizeLimit: mockHeapStatistics.heap_size_limit,
        });

        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'test_component',
          },
        );
      });

      it('should record memory usage for component with operation', () => {
        const monitor = new MemoryMonitor();

        monitor.recordComponentMemoryUsage(
          mockConfig,
          'test_component',
          'test_operation',
        );

        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'test_component_test_operation',
          },
        );
      });
    });

    describe('destroy', () => {
      it('should stop monitoring and cleanup resources', () => {
        const monitor = new MemoryMonitor();

        monitor.start(mockConfig, 1000);
        monitor.destroy();

        // Fast-forward time to ensure no more periodic snapshots
        const callsBeforeDestroy = mockRecordMemoryUsage.mock.calls.length;
        vi.advanceTimersByTime(2000);

        expect(mockRecordMemoryUsage).toHaveBeenCalledTimes(callsBeforeDestroy);
      });
    });
  });

  describe('Global Memory Monitor Functions', () => {
    describe('initializeMemoryMonitor', () => {
      it('should create singleton instance', () => {
        const monitor1 = initializeMemoryMonitor();
        const monitor2 = initializeMemoryMonitor();

        expect(monitor1).toBe(monitor2);
        expect(monitor1).toBeInstanceOf(MemoryMonitor);
      });
    });

    describe('getMemoryMonitor', () => {
      it('should return null when not initialized', () => {
        _resetGlobalMemoryMonitorForTests();
        expect(getMemoryMonitor()).toBeNull();
      });

      it('should return initialized monitor', () => {
        const initialized = initializeMemoryMonitor();
        const retrieved = getMemoryMonitor();

        expect(retrieved).toBe(initialized);
      });
    });

    describe('recordCurrentMemoryUsage', () => {
      it('should initialize monitor and take snapshot', () => {
        const snapshot = recordCurrentMemoryUsage(mockConfig, 'test_context');

        expect(snapshot).toEqual({
          timestamp: Date.now(),
          heapUsed: mockMemoryUsage.heapUsed,
          heapTotal: mockMemoryUsage.heapTotal,
          external: mockMemoryUsage.external,
          rss: mockMemoryUsage.rss,
          arrayBuffers: mockMemoryUsage.arrayBuffers,
          heapSizeLimit: mockHeapStatistics.heap_size_limit,
        });

        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'test_context',
          },
        );
      });
    });

    describe('startGlobalMemoryMonitoring', () => {
      it('should initialize and start global monitoring', () => {
        startGlobalMemoryMonitoring(mockConfig, 1000);

        // Verify initial snapshot
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'monitoring_start',
          },
        );

        // Fast-forward and verify monitoring snapshot
        vi.advanceTimersByTime(1000);
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          expect.any(Number),
          {
            memory_type: 'heap_used',
            component: 'monitoring_start',
          },
        );
      });
    });

    describe('stopGlobalMemoryMonitoring', () => {
      it('should stop global monitoring when monitor exists', () => {
        startGlobalMemoryMonitoring(mockConfig, 1000);
        stopGlobalMemoryMonitoring(mockConfig);

        // Verify final snapshot
        expect(mockRecordMemoryUsage).toHaveBeenCalledWith(
          mockConfig,
          mockMemoryUsage.heapUsed,
          {
            memory_type: 'heap_used',
            component: 'monitoring_stop',
          },
        );

        // Verify no more periodic snapshots
        const callsAfterStop = mockRecordMemoryUsage.mock.calls.length;
        vi.advanceTimersByTime(2000);
        expect(mockRecordMemoryUsage.mock.calls.length).toBe(callsAfterStop);
      });

      it('should handle stop when no global monitor exists', () => {
        expect(() => stopGlobalMemoryMonitoring(mockConfig)).not.toThrow();
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle process.memoryUsage() errors gracefully', () => {
      mockProcessMemoryUsage.mockImplementation(() => {
        throw new Error('Memory access error');
      });

      const monitor = new MemoryMonitor();

      expect(() => monitor.getCurrentMemoryUsage()).toThrow(
        'Memory access error',
      );
    });

    it('should handle v8.getHeapStatistics() errors gracefully', () => {
      mockV8GetHeapStatistics.mockImplementation(() => {
        throw new Error('Heap statistics error');
      });

      const monitor = new MemoryMonitor();

      expect(() => monitor.getCurrentMemoryUsage()).toThrow(
        'Heap statistics error',
      );
    });

    it('should handle metric recording errors gracefully', () => {
      mockRecordMemoryUsage.mockImplementation(() => {
        throw new Error('Metric recording error');
      });

      const monitor = new MemoryMonitor();

      // Should propagate error if metric recording fails
      expect(() => monitor.takeSnapshot('test', mockConfig)).toThrow(
        'Metric recording error',
      );
    });
  });
});
