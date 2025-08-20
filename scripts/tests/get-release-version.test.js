/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getReleaseVersion } from '../get-release-version';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('getReleaseVersion', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.useFakeTimers();
    // Mock git commands
    vi.mocked(execSync).mockImplementation((command) => {
      if (command.startsWith('git tag')) {
        return 'v1.1.0\nv1.0.0';
      }
      if (command.startsWith('git rev-parse')) {
        return 'abcdef';
      }
      return '';
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should calculate nightly version when IS_NIGHTLY is true', () => {
    process.env.IS_NIGHTLY = 'true';
    const knownDate = new Date('2025-07-20T10:00:00.000Z');
    vi.setSystemTime(knownDate);

    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.3.0-nightly.20250720.abcdef');
    expect(releaseVersion).toBe('1.3.0-nightly.20250720.abcdef');
    expect(npmTag).toBe('nightly');
  });

  it('should calculate preview version when IS_PREVIEW is true', () => {
    process.env.IS_PREVIEW = 'true';
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.0-preview');
    expect(releaseVersion).toBe('1.2.0-preview');
    expect(npmTag).toBe('preview');
  });

  it('should use manual version when provided', () => {
    process.env.MANUAL_VERSION = '1.2.3';
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v1.2.3');
    expect(releaseVersion).toBe('1.2.3');
    expect(npmTag).toBe('latest');
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

  it('should throw an error if no version is provided for non-nightly release', () => {
    expect(() => getReleaseVersion()).toThrow(
      'Error: No version specified and this is not a nightly or preview release.',
    );
  });

  it('should throw an error for versions with build metadata', () => {
    process.env.MANUAL_VERSION = 'v1.2.3+build456';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Versions with build metadata (+) are not supported for releases.',
    );
  });
});
