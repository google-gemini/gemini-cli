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
    // NPM dist-tags - source of truth
    if (command.includes('npm view') && command.includes('--tag=latest'))
      return '0.4.1';
    if (command.includes('npm view') && command.includes('--tag=preview'))
      return '0.5.0-preview.2';
    if (command.includes('npm view') && command.includes('--tag=nightly'))
      return '0.6.0-nightly.20250910.a31830a3';

    // NPM versions list - for conflict validation
    if (command.includes('npm view') && command.includes('versions --json'))
      return JSON.stringify([
        '0.4.1',
        '0.5.0-preview.2',
        '0.6.0-nightly.20250910.a31830a3',
      ]);

    // Git Tag Mocks - with semantic sorting
    if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'")) return 'v0.4.1';
    if (command.includes("git tag -l 'v*-preview*'")) return 'v0.5.0-preview.2';
    if (command.includes("git tag -l 'v*-nightly*'"))
      return 'v0.6.0-nightly.20250910.a31830a3';

    // Conflict validation - Git tag checks
    if (command.includes("git tag -l 'v0.5.0'")) return ''; // Version doesn't exist yet
    if (command.includes("git tag -l 'v0.4.2'")) return ''; // Version doesn't exist yet
    if (command.includes("git tag -l 'v0.6.0-preview.0'")) return ''; // Version doesn't exist yet

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

  describe('Semver Sorting Edge Cases', () => {
    it('should handle Git tag creation date vs semantic version sorting', () => {
      const mockWithSemverGitSorting = (command) => {
        // NPM dist-tags are correct (source of truth)
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.5.0'; // NPM correctly has 0.5.0 as latest
        if (command.includes('npm view') && command.includes('--tag=preview'))
          return '0.6.0-preview.2';
        if (command.includes('npm view') && command.includes('--tag=nightly'))
          return '0.7.0-nightly.20250910.a31830a3';

        // NPM versions list for conflict validation
        if (command.includes('npm view') && command.includes('versions --json'))
          return JSON.stringify([
            '0.0.77', // This was the problematic dev version
            '0.4.1',
            '0.5.0',
            '0.6.0-preview.1',
            '0.6.0-preview.2',
            '0.7.0-nightly.20250910.a31830a3',
          ]);

        // Git tags - test that semantic sorting works correctly
        if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'"))
          return 'v0.0.77\nv0.5.0\nv0.4.1'; // Multiple tags - should pick v0.5.0 semantically
        if (command.includes("git tag -l 'v*-preview*'"))
          return 'v0.6.0-preview.2';
        if (command.includes("git tag -l 'v*-nightly*'"))
          return 'v0.7.0-nightly.20250910.a31830a3';

        // Conflict validation - new versions don't exist yet
        if (command.includes("git tag -l 'v0.5.1'")) return '';
        if (command.includes("git tag -l 'v0.6.0'")) return '';

        // GitHub releases
        if (command.includes('gh release view "v0.5.0"')) return 'v0.5.0';
        if (command.includes('gh release view "v0.6.0-preview.2"'))
          return 'v0.6.0-preview.2';
        if (
          command.includes('gh release view "v0.7.0-nightly.20250910.a31830a3"')
        )
          return 'v0.7.0-nightly.20250910.a31830a3';

        // GitHub conflict validation - new versions don't exist
        if (command.includes('gh release view "v0.5.1"'))
          throw new Error('Not found');
        if (command.includes('gh release view "v0.6.0"'))
          throw new Error('Not found');

        // Git Hash Mock
        if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithSemverGitSorting);

      // Test patch calculation - should be 0.5.1 from NPM's latest=0.5.0
      const patchResult = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(patchResult.releaseVersion).toBe('0.5.1');
      expect(patchResult.previousReleaseTag).toBe('v0.5.0');

      // Verify no rollback information is included in normal scenarios
      expect(patchResult.rollbackDetected).toBeUndefined();

      // Test stable calculation - should be 0.6.0 from preview
      const stableResult = getVersion({ type: 'stable' });
      expect(stableResult.releaseVersion).toBe('0.6.0');
      expect(stableResult.previousReleaseTag).toBe('v0.5.0');

      // Verify no rollback information for stable calculation either
      expect(stableResult.rollbackDetected).toBeUndefined();
    });

    it('should fail when git tags are not semver-sorted correctly', () => {
      const mockWithIncorrectGitSorting = (command) => {
        // NPM correctly returns 0.5.0 as latest
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.5.0';

        // But git tag sorting returns wrong semantic version
        if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'"))
          return 'v0.4.1'; // This should cause a discrepancy error (NPM says 0.5.0)

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithIncorrectGitSorting);

      // This should throw because NPM says 0.5.0 but git tag sorting says v0.4.1
      expect(() =>
        getVersion({ type: 'patch', 'patch-from': 'stable' }),
      ).toThrow(
        'Discrepancy found! NPM latest tag (0.5.0) does not match latest git latest tag (v0.4.1).',
      );
    });

    it('should handle rollback scenarios by using highest existing version', () => {
      const mockWithRollback = (command) => {
        // NPM dist-tag was rolled back from 0.5.0 to 0.4.1 due to issues
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.4.1'; // Rolled back version
        if (command.includes('npm view') && command.includes('--tag=preview'))
          return '0.6.0-preview.2';
        if (command.includes('npm view') && command.includes('--tag=nightly'))
          return '0.7.0-nightly.20250910.a31830a3';

        // NPM versions list shows 0.5.0 was published (but rolled back)
        if (command.includes('npm view') && command.includes('versions --json'))
          return JSON.stringify([
            '0.3.0',
            '0.4.1', // Current dist-tag
            '0.5.0', // Published but rolled back
            '0.6.0-preview.1',
            '0.6.0-preview.2',
            '0.7.0-nightly.20250910.a31830a3',
          ]);

        // Git tags show both versions exist
        if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'"))
          return 'v0.4.1\nv0.5.0'; // Both tags exist
        if (command.includes("git tag -l 'v*-preview*'"))
          return 'v0.6.0-preview.2';
        if (command.includes("git tag -l 'v*-nightly*'"))
          return 'v0.7.0-nightly.20250910.a31830a3';

        // Specific git tag checks for rollback validation
        if (command.includes("git tag -l 'v0.5.0'")) return 'v0.5.0';

        // Conflict validation - new versions don't exist yet
        if (command.includes("git tag -l 'v0.5.1'")) return '';
        if (command.includes("git tag -l 'v0.6.0'")) return '';

        // GitHub releases exist for both versions
        if (command.includes('gh release view "v0.4.1"')) return 'v0.4.1';
        if (command.includes('gh release view "v0.5.0"')) return 'v0.5.0'; // Exists but rolled back
        if (command.includes('gh release view "v0.6.0-preview.2"'))
          return 'v0.6.0-preview.2';

        // GitHub conflict validation - new versions don't exist
        if (command.includes('gh release view "v0.5.1"'))
          throw new Error('Not found');
        if (command.includes('gh release view "v0.6.0"'))
          throw new Error('Not found');

        // Git Hash Mock
        if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithRollback);

      // Mock console.warn to capture rollback warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Test patch calculation - should be 0.5.1 (from rolled back 0.5.0, not current dist-tag 0.4.1)
      const patchResult = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(patchResult.releaseVersion).toBe('0.5.1'); // Fix for 0.5.0, not 0.4.2
      expect(patchResult.previousReleaseTag).toBe('v0.5.0'); // Uses highest existing, not dist-tag

      // Verify rollback information is included in output
      expect(patchResult.rollbackDetected).toBeDefined();
      expect(patchResult.rollbackDetected.rollbackScenario).toBe(true);
      expect(patchResult.rollbackDetected.distTagVersion).toBe('0.4.1');
      expect(patchResult.rollbackDetected.highestExistingVersion).toBe('0.5.0');
      expect(patchResult.rollbackDetected.baselineUsed).toBe('0.5.0');
      expect(patchResult.rollbackDetected.message).toContain(
        'Rollback detected: NPM tag was 0.4.1, but using 0.5.0 as baseline for next version calculation',
      );

      // Verify rollback was detected and warning was shown
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Rollback detected! NPM latest tag is 0.4.1, but using 0.5.0 as baseline for next version calculation',
        ),
      );

      // Test stable calculation - should be 0.6.0 from preview
      const stableResult = getVersion({ type: 'stable' });
      expect(stableResult.releaseVersion).toBe('0.6.0');
      expect(stableResult.previousReleaseTag).toBe('v0.5.0'); // Uses rollback baseline

      consoleSpy.mockRestore();
    });

    it('should fail rollback scenario when git tag for highest version is missing', () => {
      const mockWithMissingGitTag = (command) => {
        // NPM rolled back but git tag was deleted (bad practice)
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.4.1'; // Rolled back

        if (command.includes('npm view') && command.includes('versions --json'))
          return JSON.stringify(['0.4.1', '0.5.0']); // 0.5.0 exists in NPM

        if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'"))
          return 'v0.4.1'; // Only old tag exists

        if (command.includes("git tag -l 'v0.5.0'")) return ''; // Missing!

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithMissingGitTag);

      expect(() =>
        getVersion({ type: 'patch', 'patch-from': 'stable' }),
      ).toThrow(
        'Rollback scenario detected, but git tag v0.5.0 does not exist! This is required to calculate the next version.',
      );
    });
  });

  describe('Failure Path - Discrepancy Checks', () => {
    it('should throw an error if the git tag does not match npm', () => {
      const mockWithMismatchGitTag = (command) => {
        if (command.includes("git tag -l 'v*-preview*'"))
          return 'v0.4.0-preview.99'; // Mismatch with NPM's 0.5.0-preview.2
        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithMismatchGitTag);

      expect(() => getVersion({ type: 'stable' })).toThrow(
        'Discrepancy found! NPM preview tag (0.5.0-preview.2) does not match latest git preview tag (v0.4.0-preview.99).',
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
