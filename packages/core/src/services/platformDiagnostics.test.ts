/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

import {
  getCachedCpuCompatibility,
  buildPlatformDiagnostics,
  formatDiagnosticsReport,
  _resetCachedCompatibilityForTest,
  type PlatformDiagnosticsReport,
} from './platformDiagnostics.js';

vi.mock('node:fs');

const mockCpus = vi.fn();
const mockRelease = vi.fn();
const mockTotalmem = vi.fn();
const mockAvailableParallelism = vi.fn();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    cpus: (...args: unknown[]) => mockCpus(...args),
    release: (...args: unknown[]) => mockRelease(...args),
    totalmem: (...args: unknown[]) => mockTotalmem(...args),
    availableParallelism: (...args: unknown[]) =>
      mockAvailableParallelism(...args),
  };
});

describe('platformDiagnostics', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(() => {
    _resetCachedCompatibilityForTest();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    mockCpus.mockReturnValue([
      {
        model: 'Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz',
        speed: 3700,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ]);
    mockRelease.mockReturnValue('6.1.0-generic');
    mockTotalmem.mockReturnValue(16 * 1024 ** 3);
    mockAvailableParallelism.mockReturnValue(12);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    vi.restoreAllMocks();
    _resetCachedCompatibilityForTest();
  });

  describe('getCachedCpuCompatibility', () => {
    it('should cache the result across multiple calls', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: sse4_2 avx avx2 aes\n',
      );

      const first = getCachedCpuCompatibility();
      const second = getCachedCpuCompatibility();

      expect(first).toBe(second); // Same reference
      expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
    });

    it('should return fresh result after cache reset', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: sse4_2 avx avx2 aes\n',
      );

      getCachedCpuCompatibility();
      _resetCachedCompatibilityForTest();

      vi.mocked(fs.readFileSync).mockReturnValue('flags\t\t: sse4_2 ssse3\n');

      const result = getCachedCpuCompatibility();

      expect(result.compatible).toBe(false);
      expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(2);
    });
  });

  describe('buildPlatformDiagnostics', () => {
    it('should build a complete diagnostics report for a compatible system', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: sse4_2 avx avx2 aes\n',
      );

      const report = buildPlatformDiagnostics();

      expect(report.platform).toBe('linux');
      expect(report.arch).toBe('x64');
      expect(report.cpuModel).toContain('i7-8700K');
      expect(report.cpuCores).toBe(12);
      expect(report.totalMemoryGb).toBe('16.00');
      expect(report.antigravityReady).toBe(true);
      expect(report.cpuCompatibility.compatible).toBe(true);
      expect(report.timestamp).toBeTruthy();
    });

    it('should build a report for an incompatible system', () => {
      mockCpus.mockReturnValue([
        {
          model: 'AMD A6-3420M APU',
          speed: 1500,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        },
      ]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        'flags\t\t: fpu sse sse2 sse4_1 sse4_2\n',
      );

      const report = buildPlatformDiagnostics();

      expect(report.antigravityReady).toBe(false);
      expect(report.cpuCompatibility.missingFeatures).toContain('AVX');
    });
  });

  describe('formatDiagnosticsReport', () => {
    it('should format a compatible system report', () => {
      const report: PlatformDiagnosticsReport = {
        timestamp: '2026-05-21T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        nodeVersion: 'v22.22.2',
        osRelease: '6.1.0-generic',
        cpuModel: 'Intel(R) Core(TM) i7-8700K',
        cpuCores: 12,
        totalMemoryGb: '16.00',
        cpuCompatibility: {
          compatible: true,
          cpuModel: 'Intel(R) Core(TM) i7-8700K',
          arch: 'x64',
          microarchLevel: 'x86-64-v3',
          features: { sse42: true, avx: true, avx2: true, aesni: true },
          missingFeatures: [],
        },
        antigravityReady: true,
      };

      const formatted = formatDiagnosticsReport(report);

      expect(formatted).toContain('Platform: linux (x64)');
      expect(formatted).toContain('CPU: Intel(R) Core(TM) i7-8700K');
      expect(formatted).toContain('Antigravity Compatible: Yes');
      expect(formatted).not.toContain('Missing Features');
    });

    it('should include missing features for incompatible systems', () => {
      const report: PlatformDiagnosticsReport = {
        timestamp: '2026-05-21T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        nodeVersion: 'v22.22.2',
        osRelease: '6.1.0-generic',
        cpuModel: 'AMD A6-3420M APU',
        cpuCores: 4,
        totalMemoryGb: '4.00',
        cpuCompatibility: {
          compatible: false,
          cpuModel: 'AMD A6-3420M APU',
          arch: 'x64',
          microarchLevel: 'x86-64-v2',
          features: { sse42: true, avx: false, avx2: false, aesni: false },
          missingFeatures: ['AVX', 'AVX2'],
        },
        antigravityReady: false,
      };

      const formatted = formatDiagnosticsReport(report);

      expect(formatted).toContain('Antigravity Compatible: No');
      expect(formatted).toContain('Missing Features: AVX, AVX2');
      expect(formatted).toContain('x86-64-v2');
    });
  });
});
