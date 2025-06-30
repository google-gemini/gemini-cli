/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the package utility
vi.mock('./package.js', () => ({
  getPackageJson: vi.fn(),
}));

const mockGetPackageJson = (await import('./package.js')).getPackageJson;

describe('Version Utilities', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('getCliVersion', () => {
    it('should return version from package.json', async () => {
      vi.mocked(mockGetPackageJson).mockResolvedValue({
        name: 'gemini-cli',
        version: '1.2.3',
      });

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('1.2.3');
    });

    it('should return version from CLI_VERSION environment variable', async () => {
      process.env.CLI_VERSION = '2.0.0-dev';
      vi.mocked(mockGetPackageJson).mockResolvedValue({
        version: '1.2.3',
      });

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('2.0.0-dev');
    });

    it('should return "unknown" when package.json has no version', async () => {
      vi.mocked(mockGetPackageJson).mockResolvedValue({
        name: 'gemini-cli',
      });

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('unknown');
    });

    it('should return "unknown" when package.json is null', async () => {
      vi.mocked(mockGetPackageJson).mockResolvedValue(null);

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('unknown');
    });

    it('should prioritize CLI_VERSION over package.json', async () => {
      process.env.CLI_VERSION = '3.0.0-beta';
      vi.mocked(mockGetPackageJson).mockResolvedValue({
        version: '1.2.3',
      });

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('3.0.0-beta');
    });

    it('should handle empty CLI_VERSION environment variable', async () => {
      process.env.CLI_VERSION = '';
      vi.mocked(mockGetPackageJson).mockResolvedValue({
        version: '1.2.3',
      });

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('1.2.3');
    });

    it('should handle package loading errors gracefully', async () => {
      vi.mocked(mockGetPackageJson).mockRejectedValue(
        new Error('File not found'),
      );

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('unknown');
    });

    it('should handle package loading errors gracefully with environment variable fallback', async () => {
      process.env.CLI_VERSION = '3.0.0-error-fallback';
      vi.mocked(mockGetPackageJson).mockRejectedValue(
        new Error('Package loading failed'),
      );

      const { getCliVersion } = await import('./version');
      const version = await getCliVersion();

      expect(version).toBe('3.0.0-error-fallback');
    });
  });
});
