/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getVersion } from '../get-release-version.js';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');
vi.mock('node:fs');

vi.mock('../get-release-version.js', async () => {
  const actual = await vi.importActual('../get-release-version.js');
  return {
    ...actual,
    getVersion: (options) => {
      if (options.type === 'nightly') {
        return {
          releaseTag: 'v0.6.0-nightly.20250911.a1b2c3d',
          releaseVersion: '0.6.0-nightly.20250911.a1b2c3d',
          npmTag: 'nightly',
          previousReleaseTag: 'v0.5.0-nightly.20250910.abcdef',
        };
      }
      return actual.getVersion(options);
    },
  };
});

describe('getReleaseVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock date to be consistent
    vi.setSystemTime(new Date('2025-09-11T00:00:00.000Z'));
  });

  describe('Nightly Workflow Logic', () => {
    it('should calculate the next nightly version based on package.json', async () => {
      const { getVersion } = await import('../get-release-version.js');
      const result = getVersion({ type: 'nightly' });

      expect(result.releaseVersion).toBe('0.6.0-nightly.20250911.a1b2c3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe('v0.5.0-nightly.20250910.abcdef');
    });
  });

  describe('Promote Workflow Logic', () => {
    it('should calculate stable version from the latest preview tag', () => {
      const latestPreview = 'v0.5.0-preview';
      const latestStable = 'v0.4.0';

      vi.mocked(execSync).mockImplementation((command) => {
        if (command.includes('not')) return latestStable;
        if (command.includes('contains("preview")')) return latestPreview;
        return '';
      });

      const result = getVersion({ type: 'stable' });

      expect(result.releaseVersion).toBe('0.5.0');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe(latestStable);
    });

    it('should calculate preview version from the latest nightly tag', () => {
      const latestNightly = 'v0.6.0-nightly.20250910.abcdef';
      const latestPreview = 'v0.5.0-preview';

      vi.mocked(execSync).mockImplementation((command) => {
        if (command.includes('nightly')) return latestNightly;
        if (command.includes('preview')) return latestPreview;
        return '';
      });

      const result = getVersion({ type: 'preview' });

      expect(result.releaseVersion).toBe('0.6.0-preview');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe(latestPreview);
    });
  });
});
