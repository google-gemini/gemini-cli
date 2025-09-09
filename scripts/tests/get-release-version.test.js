/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getReleaseVersion } from '../get-release-version';

// Mock child_process so we can spy on execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('getReleaseVersion', async () => {
  // Dynamically import execSync after mocking
  const { execSync } = await import('node:child_process');
  const fs = await import('fs');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    // Mock date to be consistent
    vi.setSystemTime(new Date('2025-08-20T00:00:00.000Z'));
    // Provide a default mock for execSync to avoid toString() on undefined
    vi.mocked(execSync).mockReturnValue('');
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: '0.6.0-nightly' }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('should generate a nightly version and get previous tag', () => {
    process.env.IS_NIGHTLY = 'true';

    vi.mocked(execSync).mockImplementation((command) => {
      if (command.includes('git rev-parse')) {
        return 'abcdef';
      }
      if (command.includes('gh release list')) {
        return 'v0.6.0-nightly.20250819.abcdef';
      }
      return '';
    });

    const result = getReleaseVersion();

    expect(result).toEqual({
      releaseTag: 'v0.6.0-nightly.20250820.abcdef',
      releaseVersion: '0.6.0-nightly.20250820.abcdef',
      npmTag: 'nightly',
      previousReleaseTag: 'v0.6.0-nightly.20250819.abcdef',
    });
  });

  it('should generate a preview version and get previous tag', () => {
    process.env.IS_PREVIEW = 'true';

    vi.mocked(execSync).mockImplementation((command) => {
      if (command.includes('gh release list')) {
        return 'v0.5.0'; // Previous stable release
      }
      return '';
    });

    const result = getReleaseVersion();

    expect(result).toEqual({
      releaseTag: 'v0.6.0-preview',
      releaseVersion: '0.6.0-preview',
      npmTag: 'preview',
      previousReleaseTag: 'v0.5.0',
    });
  });

  it('should generate a stable version', () => {
    vi.mocked(execSync).mockImplementation((command) => {
      if (command.includes('gh release list')) {
        return 'v0.5.0'; // Previous stable release
      }
      return '';
    });

    const result = getReleaseVersion();

    expect(result).toEqual({
      releaseTag: 'v0.6.0',
      releaseVersion: '0.6.0',
      npmTag: 'latest',
      previousReleaseTag: 'v0.5.0',
    });
  });

  it('should use the manual version and get previous tag', () => {
    process.env.MANUAL_VERSION = 'v0.1.1';

    vi.mocked(execSync).mockImplementation((command) => {
      if (command.includes('gh release list')) {
        return 'v0.1.0'; // Previous stable release
      }
      return '';
    });

    const result = getReleaseVersion();

    expect(result).toEqual({
      releaseTag: 'v0.1.1',
      releaseVersion: '0.1.1',
      npmTag: 'latest',
      previousReleaseTag: 'v0.1.0',
    });
  });

  it('should prepend v to manual version if missing', () => {
    process.env.MANUAL_VERSION = '1.2.3';
    const { releaseTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3');
  });

  it('should handle pre-release versions correctly', () => {
    process.env.MANUAL_VERSION = 'v1.2.3-beta.1';
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3-beta.1');
    expect(releaseVersion).toBe('1.2.3-beta.1');
    expect(npmTag).toBe('beta');
  });

  it('should throw an error for invalid version format', () => {
    process.env.MANUAL_VERSION = '1.2';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Version must be in the format vX.Y.Z or vX.Y.Z-prerelease',
    );
  });

  it('should throw an error for versions with build metadata', () => {
    process.env.MANUAL_VERSION = 'v1.2.3+build456';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Versions with build metadata (+) are not supported for releases.',
    );
  });
});
