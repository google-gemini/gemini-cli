/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import { checkForUpdates } from './updateCheck.js';
import type { InstallationInfo } from '../../utils/installationInfo.js';
import { PackageManager } from '../../utils/installationInfo.js';
import { MESSAGES, NPM_DIST_TAGS } from './constants.js';

// Mock the getPackageJson utility
const getPackageJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/package.js', () => ({
  getPackageJson,
}));

// Mock the update-notifier library
const updateNotifier = vi.hoisted(() => vi.fn());
vi.mock('update-notifier', () => ({
  default: updateNotifier,
}));

const mockNpmInstallationInfo: InstallationInfo = {
  packageManager: PackageManager.NPM,
  isGlobal: true,
};

const mockHomebrewInstallationInfo: InstallationInfo = {
  packageManager: PackageManager.HOMEBREW,
  isGlobal: true,
};

describe('checkForUpdates', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['DEV'];
    global.fetch = vi.fn();

    // Default mock for getPackageJson
    getPackageJson.mockResolvedValue({
      name: 'gemini-cli',
      version: '1.0.0',
    });
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should return null when running from source (DEV=true)', async () => {
    process.env['DEV'] = 'true';
    const result = await checkForUpdates(mockNpmInstallationInfo);
    expect(result).toBeNull();
    expect(getPackageJson).not.toHaveBeenCalled();
  });

  it('should return null if package.json is missing', async () => {
    getPackageJson.mockResolvedValue(null);
    const result = await checkForUpdates(mockNpmInstallationInfo);
    expect(result).toBeNull();
  });

  describe('NPM Provider', () => {
    it('should return an update if a newer stable version is available', async () => {
      updateNotifier.mockReturnValue({
        fetchInfo: vi.fn().mockResolvedValue({ latest: '1.1.0' }),
      });
      const result = await checkForUpdates(mockNpmInstallationInfo);
      expect(result?.message).toBe(MESSAGES.UPDATE_AVAILABLE('1.0.0', '1.1.0'));
      expect(result?.update.latest).toBe('1.1.0');
    });

    it('should check both nightly and latest for a nightly install', async () => {
      getPackageJson.mockResolvedValue({
        name: 'gemini-cli',
        version: '1.2.0-nightly.1',
      });
      const fetchInfoMock = vi.fn().mockImplementation(({ distTag }) => {
        if (distTag === NPM_DIST_TAGS.NIGHTLY)
          return Promise.resolve({ latest: '1.2.0-nightly.2' });
        if (distTag === NPM_DIST_TAGS.LATEST)
          return Promise.resolve({ latest: '1.1.0' });
        return Promise.resolve(null);
      });
      updateNotifier.mockImplementation(({ distTag }) => ({
        fetchInfo: () => fetchInfoMock({ distTag }),
      }));

      const result = await checkForUpdates(mockNpmInstallationInfo);
      expect(fetchInfoMock).toHaveBeenCalledWith({
        distTag: NPM_DIST_TAGS.NIGHTLY,
      });
      expect(fetchInfoMock).toHaveBeenCalledWith({
        distTag: NPM_DIST_TAGS.LATEST,
      });
      expect(result?.update.latest).toBe('1.2.0-nightly.2');
    });

    it('should log error properly with stack trace when NPM fetch fails', async () => {
      const testError = new Error('NPM registry error');
      updateNotifier.mockReturnValue({
        fetchInfo: vi.fn().mockRejectedValue(testError),
      });

      const result = await checkForUpdates(mockNpmInstallationInfo);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warningCall = consoleWarnSpy.mock.calls[0];
      expect(warningCall[0]).toBe('Failed to check for npm updates (latest):');
      expect(warningCall[1]).toBe(testError);
    });
  });

  describe('Homebrew Provider', () => {
    it('should return an update if a newer version is available', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: { stable: '1.1.0' } }),
      } as Response);

      const result = await checkForUpdates(mockHomebrewInstallationInfo);
      expect(result?.message).toBe(MESSAGES.UPDATE_AVAILABLE('1.0.0', '1.1.0'));
      expect(result?.update.latest).toBe('1.1.0');
      expect(updateNotifier).not.toHaveBeenCalled();
      
      // Verify fetch was called with timeout signal
      expect(global.fetch).toHaveBeenCalledWith(
        'https://formulae.brew.sh/api/formula/gemini-cli.json',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should return null and log a warning if the Homebrew API fetch fails', async () => {
      const testError = new Error('Network Error');
      vi.mocked(global.fetch).mockRejectedValue(testError);

      const result = await checkForUpdates(mockHomebrewInstallationInfo);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warningCall = consoleWarnSpy.mock.calls[0];
      expect(warningCall[0]).toBe('Failed to check for Homebrew updates:');
      expect(warningCall[1]).toBe(testError);
    });

    it('should return null and not log warning for timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(global.fetch).mockRejectedValue(abortError);

      const result = await checkForUpdates(mockHomebrewInstallationInfo);

      expect(result).toBeNull();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return null for a pre-release Homebrew version', async () => {
      getPackageJson.mockResolvedValue({
        name: 'gemini-cli',
        version: '1.2.0-nightly.1',
      });
      const result = await checkForUpdates(mockHomebrewInstallationInfo);
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null if API returns non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await checkForUpdates(mockHomebrewInstallationInfo);
      expect(result).toBeNull();
    });

    it('should return null if API response is missing version data', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: {} }),
      } as Response);

      const result = await checkForUpdates(mockHomebrewInstallationInfo);
      expect(result).toBeNull();
    });
  });
});
