/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getAntigravityInstallInfo,
  getAntigravityCompatibility,
} from './antigravityUtils.js';

// Mock the core dependency
const mockGetCachedCpuCompatibility = vi.fn();
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual<
    typeof import('@google/gemini-cli-core')
  >('@google/gemini-cli-core');
  return {
    ...actual,
    getCachedCpuCompatibility: () => mockGetCachedCpuCompatibility(),
  };
});

describe('antigravityUtils', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
  });

  describe('getAntigravityInstallInfo', () => {
    it('should return macOS installation info on darwin platform', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const info = getAntigravityInstallInfo();

      expect(info).toEqual({
        platformName: 'macOS',
        installCmd:
          'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      });
    });

    it('should return Linux installation info on linux platform', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const info = getAntigravityInstallInfo();

      expect(info).toEqual({
        platformName: 'Linux',
        installCmd:
          'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      });
    });

    it('should return Windows PowerShell installation info on win32 when PSModulePath is set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', 'C:\\some\\path');

      const info = getAntigravityInstallInfo();

      expect(info).toEqual({
        platformName: 'Windows (PowerShell)',
        installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
      });
    });

    it('should return Windows CMD installation info on win32 when PSModulePath is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', '');

      const info = getAntigravityInstallInfo();

      expect(info).toEqual({
        platformName: 'Windows (Command Prompt)',
        installCmd:
          'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd',
      });
    });

    it('should return null on unsupported platform', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      const info = getAntigravityInstallInfo();

      expect(info).toBeNull();
    });
  });

  describe('getAntigravityCompatibility', () => {
    beforeEach(() => {
      mockGetCachedCpuCompatibility.mockReset();
    });

    it('should report compatible when CPU supports AVX2', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetCachedCpuCompatibility.mockReturnValue({
        compatible: true,
        cpuModel: 'Intel i7-8700K',
        arch: 'x64',
        microarchLevel: 'x86-64-v3',
        features: { sse42: true, avx: true, avx2: true, aesni: true },
        missingFeatures: [],
      });

      const compat = getAntigravityCompatibility();

      expect(compat.cpuCompatible).toBe(true);
      expect(compat.incompatibilityReason).toBe('');
      expect(compat.installInfo).not.toBeNull();
    });

    it('should report incompatible for AMD A6-3420M with detailed reason', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetCachedCpuCompatibility.mockReturnValue({
        compatible: false,
        cpuModel: 'AMD A6-3420M APU',
        arch: 'x64',
        microarchLevel: 'x86-64-v2',
        features: { sse42: true, avx: false, avx2: false, aesni: false },
        missingFeatures: ['AVX', 'AVX2'],
      });

      const compat = getAntigravityCompatibility();

      expect(compat.cpuCompatible).toBe(false);
      expect(compat.incompatibilityReason).toContain('AMD A6-3420M');
      expect(compat.incompatibilityReason).toContain('AVX, AVX2');
      expect(compat.incompatibilityReason).toContain('SIGILL');
      expect(compat.incompatibilityReason).toContain('exit code 132');
      // Install info is still returned (for informational purposes)
      expect(compat.installInfo).not.toBeNull();
    });

    it('should still return installInfo even when CPU is incompatible', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockGetCachedCpuCompatibility.mockReturnValue({
        compatible: false,
        cpuModel: 'Some Legacy CPU',
        arch: 'x64',
        microarchLevel: 'x86-64-v1',
        features: { sse42: false, avx: false, avx2: false, aesni: false },
        missingFeatures: ['SSE42', 'AVX', 'AVX2'],
      });

      const compat = getAntigravityCompatibility();

      expect(compat.installInfo?.platformName).toBe('macOS');
      expect(compat.cpuCompatible).toBe(false);
    });

    it('should report compatible for ARM64 architecture', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockGetCachedCpuCompatibility.mockReturnValue({
        compatible: true,
        cpuModel: 'Apple M2',
        arch: 'arm64',
        microarchLevel: 'non-x86',
        features: { sse42: false, avx: false, avx2: false, aesni: false },
        missingFeatures: [],
      });

      const compat = getAntigravityCompatibility();

      expect(compat.cpuCompatible).toBe(true);
      expect(compat.incompatibilityReason).toBe('');
    });
  });
});
