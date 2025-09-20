/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getVersion } from '../get-release-version.js';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');

describe('getVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date('2025-09-17T00:00:00.000Z'));
  });

  const mockExecSync = (command) => {
    // NPM Mocks
    if (command.includes('npm view') && command.includes('--tag=latest'))
      return '0.4.1';
    if (command.includes('npm view') && command.includes('--tag=preview'))
      return '0.5.0-preview.2';
    if (command.includes('npm view') && command.includes('--tag=nightly'))
      return '0.6.0-nightly.20250910.a31830a3';

    // Git Tag Mocks
    if (command.includes("git tag --sort=-creatordate -l 'v[0-9].[0-9].[0-9]'"))
      return 'v0.4.1';
    if (command.includes("git tag --sort=-creatordate -l 'v*-preview*'"))
      return 'v0.5.0-preview.2';
    if (command.includes("git tag --sort=-creatordate -l 'v*-nightly*'"))
      return 'v0.6.0-nightly.20250910.a31830a3';

    // GitHub Release Mocks
    if (command.includes('gh release view "v0.4.1"')) return 'v0.4.1';
    if (command.includes('gh release view "v0.5.0-preview.2"'))
      return 'v0.5.0-preview.2';
    if (command.includes('gh release view "v0.6.0-nightly.20250910.a31830a3"'))
      return 'v0.6.0-nightly.20250910.a31830a3';

    // Git Hash Mock
    if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

    return '';
  };

  describe('Happy Path - Version Calculation', () => {
    it('should calculate the next stable version from the latest preview', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'stable' });
      expect(result.releaseVersion).toBe('0.5.0');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should use the override version for stable if provided', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({
        type: 'stable',
        stable_version_override: '1.2.3',
      });
      expect(result.releaseVersion).toBe('1.2.3');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should calculate the next preview version from the latest nightly', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'preview' });
      expect(result.releaseVersion).toBe('0.6.0-preview.0');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });

    it('should use the override version for preview if provided', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({
        type: 'preview',
        preview_version_override: '4.5.6-preview.0',
      });
      expect(result.releaseVersion).toBe('4.5.6-preview.0');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });

    it('should calculate the next nightly version from the latest nightly', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'nightly' });
      expect(result.releaseVersion).toBe('0.7.0-nightly.20250917.d3bf8a3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe(
        'v0.6.0-nightly.20250910.a31830a3',
      );
    });

    it('should calculate the next patch version for a stable release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(result.releaseVersion).toBe('0.4.2');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should calculate the next patch version for a preview release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'preview' });
      expect(result.releaseVersion).toBe('0.5.0-preview.3');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });
  });

  describe('Failure Path - Invalid Overrides', () => {
    it('should throw an error for an invalid stable_version_override', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'stable',
          stable_version_override: '1.2.3-beta',
        }),
      ).toThrow(
        'Invalid stable_version_override: 1.2.3-beta. Must be in X.Y.Z format.',
      );
    });

    it('should throw an error for an invalid preview_version_override format', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'preview',
          preview_version_override: '4.5.6-preview', // Missing .N
        }),
      ).toThrow(
        'Invalid preview_version_override: 4.5.6-preview. Must be in X.Y.Z-preview.N format.',
      );
    });

    it('should throw an error for another invalid preview_version_override format', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'preview',
          preview_version_override: '4.5.6',
        }),
      ).toThrow(
        'Invalid preview_version_override: 4.5.6. Must be in X.Y.Z-preview.N format.',
      );
    });
  });

  describe('Failure Path - Discrepancy Checks', () => {
    it('should throw an error if the git tag does not match npm', () => {
      const mockWithMismatchGitTag = (command) => {
        if (command.includes("git tag --sort=-creatordate -l 'v*-preview*'"))
          return 'v0.4.0-preview-99'; // Mismatch
        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithMismatchGitTag);

      expect(() => getVersion({ type: 'stable' })).toThrow(
        'Discrepancy found! NPM preview tag (0.5.0-preview.2) does not match latest git preview tag (v0.4.0-preview-99).',
      );
    });

    it('should throw an error if the GitHub release is missing', () => {
      const mockWithMissingRelease = (command) => {
        if (command.includes('gh release view "v0.5.0-preview.2"')) {
          throw new Error('gh command failed'); // Simulate gh failure
        }
        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithMissingRelease);

      expect(() => getVersion({ type: 'stable' })).toThrow(
        'Discrepancy found! Failed to verify GitHub release for v0.5.0-preview.2.',
      );
    });
  });
});
