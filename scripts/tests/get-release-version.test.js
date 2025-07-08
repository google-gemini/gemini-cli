/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getReleaseVersion } from '../get-release-version';
import { execSync } from 'child_process';
import * as fs from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    readFileSync: vi.fn(),
  };
});

describe('getReleaseVersion', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.useFakeTimers();
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
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ version: '0.1.0' }),
    );
    vi.mocked(execSync).mockReturnValue('abcdef');
    const { releaseTag, releaseVersion, npmTag } = getReleaseVersion();
    expect(releaseTag).toBe('v0.1.9-nightly.250720.abcdef');
    expect(releaseVersion).toBe('0.1.9-nightly.250720.abcdef');
    expect(npmTag).toBe('nightly');
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
      'Error: No version specified and this is not a nightly release.',
    );
  });

  it('should throw an error for versions with build metadata', () => {
    process.env.MANUAL_VERSION = 'v1.2.3+build456';
    expect(() => getReleaseVersion()).toThrow(
      'Error: Versions with build metadata (+) are not supported for releases.',
    );
  });
});

describe('get-release-version script', () => {
  it('should print version JSON to stdout when executed directly', () => {
    const expectedJson = {
      releaseTag: 'v0.1.0-nightly.20250705',
      releaseVersion: '0.1.0-nightly.20250705',
      npmTag: 'nightly',
    };
    execSync.mockReturnValue(JSON.stringify(expectedJson));

    const result = execSync('node scripts/get-release-version.js').toString();
    expect(JSON.parse(result)).toEqual(expectedJson);
  });
});
