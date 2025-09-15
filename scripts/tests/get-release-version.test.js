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

describe('getReleaseVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock date to be consistent
    vi.setSystemTime(new Date('2025-09-11T00:00:00.000Z'));
  });

  describe('Nightly Workflow Logic', () => {
    it('should calculate the next nightly version based on package.json', () => {
      vi.mocked(readFileSync).mockReturnValue('{"version": "0.5.0"}');
      vi.mocked(execSync).mockImplementation((command) => {
        if (command.includes('rev-parse')) return 'a1b2c3d';
        if (command.includes('release list'))
          return 'v0.5.0-nightly.20250910.abcdef';
        return '';
      });

      const result = getVersion({ type: 'nightly' });

      expect(result.releaseVersion).toBe('0.6.0-nightly.20250911.a1b2c3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe('v0.5.0-nightly.20250910.abcdef');
    });

    it('should default minor to 0 if missing in package.json version', () => {
      vi.mocked(readFileSync).mockReturnValue('{"version": "0"}');
      vi.mocked(execSync).mockImplementation((command) => {
        if (command.includes('rev-parse')) return 'a1b2c3d';
        if (command.includes('release list'))
          return 'v0.0.0-nightly.20250910.abcdef';
        return '';
      });

      const result = getVersion({ type: 'nightly' });

      expect(result.releaseVersion).toBe('0.1.0-nightly.20250911.a1b2c3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe('v0.0.0-nightly.20250910.abcdef');
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

  describe('Patch Workflow Logic', () => {
    it('should calculate the next patch version for a stable release', () => {
      const latestStable = 'v0.5.1';
      vi.mocked(execSync).mockReturnValue(latestStable);

      const result = getVersion({ type: 'patch', patchFrom: 'stable' });

      expect(result.releaseVersion).toBe('0.5.2');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe(latestStable);
    });

    it('should calculate the next patch version for a preview release', () => {
      const latestPreview = 'v0.6.0-preview';
      vi.mocked(execSync).mockReturnValue(latestPreview);

      const result = getVersion({ type: 'patch', patchFrom: 'preview' });

      expect(result.releaseVersion).toBe('0.6.1-preview');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe(latestPreview);
    });

    it('should default patch to 0 if missing in stable release', () => {
      const latestStable = 'v0.5';
      vi.mocked(execSync).mockReturnValue(latestStable);

      const result = getVersion({ type: 'patch', patchFrom: 'stable' });

      expect(result.releaseVersion).toBe('0.5.1');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe(latestStable);
    });
  });
});
