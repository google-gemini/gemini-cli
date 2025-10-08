/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getVersion } from '../get-release-version.js';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('getVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date('2025-09-17T00:00:00.000Z'));
    // Mock package.json being read by getNightlyVersion
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ version: '0.8.0' }),
    );
  });

  // This is the base mock for a clean state with no conflicts or rollbacks
  const mockExecSync = (command) => {
    // NPM dist-tags
    if (command.includes('npm view') && command.includes('--tag=latest'))
      return '0.6.1';
    if (command.includes('npm view') && command.includes('--tag=preview'))
      return '0.7.0-preview.1';
    if (command.includes('npm view') && command.includes('--tag=nightly'))
      return '0.8.0-nightly.20250916.abcdef';

    // NPM versions list
    if (command.includes('npm view') && command.includes('versions --json'))
      return JSON.stringify([
        '0.6.0',
        '0.6.1',
        '0.7.0-preview.0',
        '0.7.0-preview.1',
        '0.8.0-nightly.20250916.abcdef',
      ]);

    // Deprecation checks (default to not deprecated)
    if (command.includes('deprecated')) return '';

    // Git Tag Mocks
    if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'")) return 'v0.6.1';
    if (command.includes("git tag -l 'v*-preview*'")) return 'v0.7.0-preview.1';
    if (command.includes("git tag -l 'v*-nightly*'"))
      return 'v0.8.0-nightly.20250916.abcdef';

    // Git Hash Mock
    if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

    // For doesVersionExist checks - default to not found
    if (
      command.includes('npm view') &&
      command.includes('@google/gemini-cli@')
    ) {
      throw new Error('NPM version not found');
    }
    if (command.includes('git tag -l')) return '';
    if (command.includes('gh release view')) {
      throw new Error('GH release not found');
    }

    return '';
  };

  describe('Happy Path - Version Calculation', () => {
    it('should calculate the next stable version from the latest preview', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'stable' });
      expect(result.releaseVersion).toBe('0.7.0');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.6.1');
    });

    it('should calculate the next preview version from the latest nightly', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'preview' });
      expect(result.releaseVersion).toBe('0.8.0-preview.0');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.7.0-preview.1');
    });

    it('should calculate the next nightly version from package.json', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'nightly' });
      // Note: The base version now comes from package.json, not the previous nightly tag.
      expect(result.releaseVersion).toBe('0.8.0-nightly.20250917.d3bf8a3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe('v0.8.0-nightly.20250916.abcdef');
    });

    it('should calculate the next patch version for a stable release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(result.releaseVersion).toBe('0.6.2');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.6.1');
    });

    it('should calculate the next patch version for a preview release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'preview' });
      expect(result.releaseVersion).toBe('0.7.0-preview.2');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.7.0-preview.1');
    });
  });

  describe('Advanced Scenarios', () => {
    it('should ignore a deprecated version and use the next highest', () => {
      const mockWithDeprecated = (command) => {
        // The highest nightly is 0.9.0, but it's deprecated
        if (command.includes('npm view') && command.includes('versions --json'))
          return JSON.stringify([
            '0.8.0-nightly.20250916.abcdef',
            '0.9.0-nightly.20250917.deprecated', // This one is deprecated
          ]);
        // Mock the deprecation check
        if (
          command.includes(
            'npm view @google/gemini-cli@0.9.0-nightly.20250917.deprecated deprecated',
          )
        )
          return 'This version is deprecated';
        // The dist-tag still points to the older, valid version
        if (command.includes('npm view') && command.includes('--tag=nightly'))
          return '0.8.0-nightly.20250916.abcdef';

        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithDeprecated);

      const result = getVersion({ type: 'preview' });
      // It should base the preview off 0.8.0, not the deprecated 0.9.0
      expect(result.releaseVersion).toBe('0.8.0-preview.0');
    });

    it('should auto-increment patch version if the calculated one already exists', () => {
      const mockWithConflict = (command) => {
        // The calculated version 0.7.0 already exists as a git tag
        if (command.includes("git tag -l 'v0.7.0'")) return 'v0.7.0';
        // The next version, 0.7.1, is available
        if (command.includes("git tag -l 'v0.7.1'")) return '';

        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithConflict);

      const result = getVersion({ type: 'stable' });
      // Should have skipped 0.7.0 and landed on 0.7.1
      expect(result.releaseVersion).toBe('0.7.1');
    });

    it('should auto-increment preview number if the calculated one already exists', () => {
      const mockWithConflict = (command) => {
        // The calculated preview 0.8.0-preview.0 already exists on NPM
        if (
          command.includes(
            'npm view @google/gemini-cli@0.8.0-preview.0 version',
          )
        )
          return '0.8.0-preview.0';
        // The next one is available
        if (
          command.includes(
            'npm view @google/gemini-cli@0.8.0-preview.1 version',
          )
        )
          throw new Error('Not found');

        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithConflict);

      const result = getVersion({ type: 'preview' });
      // Should have skipped preview.0 and landed on preview.1
      expect(result.releaseVersion).toBe('0.8.0-preview.1');
    });
  });
});
