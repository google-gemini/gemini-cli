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

    // Clear any existing phases
    profiler['phases'].clear();

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
    it('should record the start time of a phase', () => {
      profiler.start('test_phase');

      const phase = profiler['phases'].get('test_phase');
      expect(phase).toBeDefined();
      expect(phase?.name).toBe('test_phase');
      expect(phase?.startTime).toBeGreaterThan(0);
      expect(phase?.duration).toBeUndefined();
    });

    it('should record start time with details', () => {
      const details = { key: 'value', count: 42 };
      profiler.start('test_phase', details);

      const phase = profiler['phases'].get('test_phase');
      expect(phase?.details).toEqual(details);
    });

    it('should overwrite existing phase if started again', () => {
      profiler.start('test_phase');
      const firstStartTime = profiler['phases'].get('test_phase')?.startTime;

      // Wait a bit to ensure different timestamp
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);

      profiler.start('test_phase');
      const secondStartTime = profiler['phases'].get('test_phase')?.startTime;

      expect(secondStartTime).not.toBe(firstStartTime);
      vi.useRealTimers();
    });
  });

  describe('end', () => {
    it('should calculate duration for a started phase', () => {
      profiler.start('test_phase');

      // Simulate some time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      profiler.end('test_phase');

      const phase = profiler['phases'].get('test_phase');
      expect(phase?.duration).toBeGreaterThan(0);

      vi.useRealTimers();
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

    it('should do nothing if phase was not started', () => {
      profiler.end('nonexistent_phase');

      const phase = profiler['phases'].get('nonexistent_phase');
      expect(phase).toBeUndefined();
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
});
