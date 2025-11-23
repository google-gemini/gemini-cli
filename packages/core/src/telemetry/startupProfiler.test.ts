/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartupProfiler } from './startupProfiler.js';
import type { Config } from '../config/config.js';

// Mock the metrics module
vi.mock('./metrics.js', () => ({
  recordStartupPerformance: vi.fn(),
}));

// Mock os module
vi.mock('node:os', () => ({
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'x64'),
  release: vi.fn(() => '22.6.0'),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

describe('StartupProfiler', () => {
  let profiler: StartupProfiler;
  let mockConfig: Config;
  let recordStartupPerformance: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Get the mocked function
    const metricsModule = await import('./metrics.js');
    recordStartupPerformance =
      metricsModule.recordStartupPerformance as ReturnType<typeof vi.fn>;

    // Create a fresh profiler instance
    profiler = StartupProfiler.getInstance();

    // Clear any existing phases and performance entries
    profiler['phases'].clear();
    performance.clearMarks();
    performance.clearMeasures();

    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = StartupProfiler.getInstance();
      const instance2 = StartupProfiler.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('start', () => {
    it('should create a performance mark for a phase', () => {
      profiler.start('test_phase');

      const phase = profiler['phases'].get('test_phase');
      expect(phase).toBeDefined();
      expect(phase?.name).toBe('test_phase');

      // Verify performance mark was created
      const marks = performance.getEntriesByType('mark');
      const startMark = marks.find(
        (m) => m.name === 'startup:test_phase:start',
      );
      expect(startMark).toBeDefined();
    });

    it('should record start time with details', () => {
      const details = { key: 'value', count: 42 };
      profiler.start('test_phase', details);

      const phase = profiler['phases'].get('test_phase');
      expect(phase?.details).toEqual(details);
    });

    it('should throw error when starting a phase that is already active', () => {
      profiler.start('test_phase');

      expect(() => profiler.start('test_phase')).toThrow(
        "Cannot start phase 'test_phase': phase is already active",
      );
    });
  });

  describe('end', () => {
    it('should create a performance measure for a started phase', () => {
      profiler.start('test_phase');
      profiler.end('test_phase');

      // Verify performance measure was created
      const measures = performance.getEntriesByType('measure');
      const measure = measures.find((m) => m.name === 'test_phase');
      expect(measure).toBeDefined();
      expect(measure?.duration).toBeGreaterThan(0);
    });

    it('should merge details when ending a phase', () => {
      profiler.start('test_phase', { initial: 'value' });
      profiler.end('test_phase', { additional: 'data' });

      const phase = profiler['phases'].get('test_phase');
      expect(phase?.details).toEqual({
        initial: 'value',
        additional: 'data',
      });
    });

    it('should throw error if phase was not started', () => {
      expect(() => profiler.end('nonexistent_phase')).toThrow(
        "Cannot end phase 'nonexistent_phase': phase was never started",
      );
    });

    it('should overwrite details with same key', () => {
      profiler.start('test_phase', { key: 'original' });
      profiler.end('test_phase', { key: 'updated' });

      const phase = profiler['phases'].get('test_phase');
      expect(phase?.details).toEqual({ key: 'updated' });
    });
  });

  describe('flush', () => {
    it('should call recordStartupPerformance for each completed phase', () => {
      profiler.start('phase1');
      profiler.end('phase1');

      profiler.start('phase2');
      profiler.end('phase2');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledTimes(2);
    });

    it('should not record phases without duration', () => {
      profiler.start('incomplete_phase');
      profiler.flush(mockConfig);

      expect(recordStartupPerformance).not.toHaveBeenCalled();
    });

    it('should include common details in all metrics', () => {
      profiler.start('test_phase');
      profiler.end('test_phase');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({
          phase: 'test_phase',
          details: expect.objectContaining({
            os_platform: 'darwin',
            os_arch: 'x64',
            os_release: '22.6.0',
            is_docker: false,
            cpu_usage_user: expect.any(Number),
            cpu_usage_system: expect.any(Number),
          }),
        }),
      );
    });

    it('should merge phase-specific details with common details', () => {
      profiler.start('test_phase', { custom: 'value' });
      profiler.end('test_phase');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({
          phase: 'test_phase',
          details: expect.objectContaining({
            custom: 'value',
            os_platform: 'darwin',
          }),
        }),
      );
    });

    it('should clear phases after flushing', () => {
      profiler.start('test_phase');
      profiler.end('test_phase');

      profiler.flush(mockConfig);

      expect(profiler['phases'].size).toBe(0);
    });

    it('should detect Docker environment', async () => {
      const fs = await import('node:fs');
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      profiler.start('test_phase');
      profiler.end('test_phase');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({
          details: expect.objectContaining({
            is_docker: true,
          }),
        }),
      );
    });

    it('should calculate CPU usage correctly', () => {
      const cpuUsageSpy = vi.spyOn(process, 'cpuUsage');
      // Mock start usage
      cpuUsageSpy.mockReturnValueOnce({ user: 1000, system: 500 });
      // Mock diff usage (this is what process.cpuUsage(startUsage) returns)
      cpuUsageSpy.mockReturnValueOnce({ user: 100, system: 50 });

      profiler.start('cpu_test_phase');
      profiler.end('cpu_test_phase');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({
          phase: 'cpu_test_phase',
          details: expect.objectContaining({
            cpu_usage_user: 100,
            cpu_usage_system: 50,
          }),
        }),
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle a complete startup profiling workflow', () => {
      // Simulate startup sequence
      profiler.start('total_startup');

      profiler.start('load_settings');
      profiler.end('load_settings');

      profiler.start('parse_arguments');
      profiler.end('parse_arguments');

      profiler.start('initialize_app');
      profiler.end('initialize_app');

      profiler.end('total_startup');

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).toHaveBeenCalledTimes(4);
      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({ phase: 'total_startup' }),
      );
    });

    it('should handle nested timing correctly', () => {
      profiler.start('outer');
      profiler.start('inner');
      profiler.end('inner');
      profiler.end('outer');

      profiler.flush(mockConfig);

      const calls = (recordStartupPerformance as ReturnType<typeof vi.fn>).mock
        .calls;
      const outerCall = calls.find((call) => call[2].phase === 'outer');
      const innerCall = calls.find((call) => call[2].phase === 'inner');

      expect(outerCall).toBeDefined();
      expect(innerCall).toBeDefined();
      // Outer duration should be >= inner duration
      expect(outerCall![1]).toBeGreaterThanOrEqual(innerCall![1]);
    });
  });

  describe('sanity checking', () => {
    it('should throw error when starting a phase that is already active', () => {
      profiler.start('test_phase');

      expect(() => profiler.start('test_phase')).toThrow(
        "Cannot start phase 'test_phase': phase is already active",
      );
    });

    it('should allow restarting a phase after it has ended', () => {
      profiler.start('test_phase');
      profiler.end('test_phase');

      // Should not throw
      expect(() => profiler.start('test_phase')).not.toThrow();
    });

    it('should throw error when ending a phase that was never started', () => {
      expect(() => profiler.end('nonexistent_phase')).toThrow(
        "Cannot end phase 'nonexistent_phase': phase was never started",
      );
    });

    it('should throw error when ending a phase that is already ended', () => {
      profiler.start('test_phase');
      profiler.end('test_phase');

      expect(() => profiler.end('test_phase')).toThrow(
        "Cannot end phase 'test_phase': phase was already ended",
      );
    });

    it('should not record metrics for incomplete phases', () => {
      profiler.start('incomplete_phase');
      // Never call end()

      profiler.flush(mockConfig);

      expect(recordStartupPerformance).not.toHaveBeenCalled();
    });

    it('should handle mix of complete and incomplete phases', () => {
      profiler.start('complete_phase');
      profiler.end('complete_phase');

      profiler.start('incomplete_phase');
      // Never call end()

      profiler.flush(mockConfig);

      // Should only record the complete phase
      expect(recordStartupPerformance).toHaveBeenCalledTimes(1);
      expect(recordStartupPerformance).toHaveBeenCalledWith(
        mockConfig,
        expect.any(Number),
        expect.objectContaining({ phase: 'complete_phase' }),
      );
    });
  });
});
