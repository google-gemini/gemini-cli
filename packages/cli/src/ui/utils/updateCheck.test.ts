/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkForUpdates } from './updateCheck.js';

const getPackageJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/package.js', () => ({
  getPackageJson,
}));

const updateNotifier = vi.hoisted(() => vi.fn());
vi.mock('update-notifier', () => ({
  default: updateNotifier,
}));

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    // Clear DEV environment variable before each test
    delete process.env.DEV;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return null when running from source (DEV=true)', async () => {
    process.env.DEV = 'true';
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi
        .fn()
        .mockResolvedValue({ current: '1.0.0', latest: '1.1.0' }),
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
    expect(getPackageJson).not.toHaveBeenCalled();
    expect(updateNotifier).not.toHaveBeenCalled();
  });

  it('should return null if package.json is missing', async () => {
    getPackageJson.mockResolvedValue(null);
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null if there is no update', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi.fn().mockResolvedValue(null),
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return a message if a newer version is available', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi
        .fn()
        .mockResolvedValue({ current: '1.0.0', latest: '1.1.0' }),
    });

    const result = await checkForUpdates();
    expect(result?.message).toContain('1.0.0 → 1.1.0');
    expect(result?.update).toEqual({ current: '1.0.0', latest: '1.1.0' });
  });

  it('should return null if the latest version is the same as the current version', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi
        .fn()
        .mockResolvedValue({ current: '1.0.0', latest: '1.0.0' }),
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null if the latest version is older than the current version', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.1.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi
        .fn()
        .mockResolvedValue({ current: '1.1.0', latest: '1.0.0' }),
    });
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null if fetchInfo rejects', async () => {
    getPackageJson.mockResolvedValue({
      name: 'test-package',
      version: '1.0.0',
    });
    updateNotifier.mockReturnValue({
      fetchInfo: vi.fn().mockRejectedValue(new Error('Timeout')),
    });

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    getPackageJson.mockRejectedValue(new Error('test error'));
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  describe('nightly updates', () => {
    it('should notify for a newer nightly version when current is nightly', async () => {
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.2.3-nightly.1',
      });

      const fetchInfoMock = vi.fn().mockImplementation(({ distTag }) => {
        if (distTag === 'nightly') {
          return Promise.resolve({
            latest: '1.2.3-nightly.2',
            current: '1.2.3-nightly.1',
          });
        }
        if (distTag === 'latest') {
          return Promise.resolve({
            latest: '1.2.3',
            current: '1.2.3-nightly.1',
          });
        }
        return Promise.resolve(null);
      });

      updateNotifier.mockImplementation(({ pkg, distTag }) => ({
        fetchInfo: () => fetchInfoMock({ pkg, distTag }),
      }));

      const result = await checkForUpdates();
      expect(result?.message).toContain('1.2.3-nightly.1 → 1.2.3-nightly.2');
      expect(result?.update.latest).toBe('1.2.3-nightly.2');
    });
  });
});
