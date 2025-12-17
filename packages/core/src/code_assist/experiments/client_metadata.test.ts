/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReleaseChannel, getReleaseChannel } from '../../utils/channel.js';
import { getVersion } from '../../utils/version.js';

// Mock dependencies before importing the module under test
vi.mock('../../utils/channel.js', async () => {
  const actual = await vi.importActual('../../utils/channel.js');
  return {
    ...(actual as object),
    getReleaseChannel: vi.fn(),
  };
});

vi.mock('../../utils/version.js', async () => ({
  getVersion: vi.fn(),
}));

describe('client_metadata', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;
  const originalCliVersion = process.env['CLI_VERSION'];
  const originalNodeVersion = process.version;

  beforeEach(async () => {
    // Reset modules to clear the cached `clientMetadataPromise`
    vi.resetModules();
    // Re-import the module to get a fresh instance
    await import('./client_metadata.js');
    // Provide a default mock implementation for each test
    vi.mocked(getReleaseChannel).mockResolvedValue(ReleaseChannel.STABLE);
    vi.mocked(getVersion).mockResolvedValue('0.0.0');
  });

  afterEach(() => {
    // Restore original process properties to avoid side-effects between tests
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    process.env['CLI_VERSION'] = originalCliVersion;
    Object.defineProperty(process, 'version', { value: originalNodeVersion });
    vi.clearAllMocks();
  });

  describe('getPlatform', () => {
    const testCases = [
      { platform: 'darwin', arch: 'x64', expected: 'DARWIN_AMD64' },
      { platform: 'darwin', arch: 'arm64', expected: 'DARWIN_ARM64' },
      { platform: 'linux', arch: 'x64', expected: 'LINUX_AMD64' },
      { platform: 'linux', arch: 'arm64', expected: 'LINUX_ARM64' },
      { platform: 'win32', arch: 'x64', expected: 'WINDOWS_AMD64' },
      { platform: 'sunos', arch: 'x64', expected: 'PLATFORM_UNSPECIFIED' },
      { platform: 'win32', arch: 'arm', expected: 'PLATFORM_UNSPECIFIED' },
    ];

    for (const { platform, arch, expected } of testCases) {
      it(`should return ${expected} for platform ${platform} and arch ${arch}`, async () => {
        Object.defineProperty(process, 'platform', { value: platform });
        Object.defineProperty(process, 'arch', { value: arch });
        const { getClientMetadata } = await import('./client_metadata.js');

        const metadata = await getClientMetadata();
        expect(metadata.platform).toBe(expected);
      });
    }
  });

  describe('getClientMetadata', () => {
    it('should use version from getCliVersion for ideVersion', async () => {
      vi.mocked(getVersion).mockResolvedValue('1.2.3');
      const { getClientMetadata } = await import('./client_metadata.js');

      const metadata = await getClientMetadata();
      expect(metadata.ideVersion).toBe('1.2.3');
    });

    it('should call getReleaseChannel to get the update channel', async () => {
      vi.mocked(getReleaseChannel).mockResolvedValue(ReleaseChannel.NIGHTLY);
      const { getClientMetadata } = await import('./client_metadata.js');

      const metadata = await getClientMetadata();

      expect(metadata.updateChannel).toBe('nightly');
      expect(getReleaseChannel).toHaveBeenCalled();
    });

    it('should cache the client metadata promise', async () => {
      const { getClientMetadata } = await import('./client_metadata.js');

      const firstCall = await getClientMetadata();
      const secondCall = await getClientMetadata();

      expect(firstCall).toBe(secondCall);
      // Ensure the underlying functions are only called once
      expect(getReleaseChannel).toHaveBeenCalledTimes(1);
    });

    it('should always return the IDE name as IDE_UNSPECIFIED', async () => {
      const { getClientMetadata } = await import('./client_metadata.js');
      const metadata = await getClientMetadata();
      expect(metadata.ideName).toBe('IDE_UNSPECIFIED');
    });

    it('should always return the pluginType as GEMINI', async () => {
      const { getClientMetadata } = await import('./client_metadata.js');
      const metadata = await getClientMetadata();
      expect(metadata.pluginType).toBe('GEMINI');
    });
  });
});
