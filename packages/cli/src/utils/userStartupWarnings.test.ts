/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'os';
import fs from 'fs/promises';
import semver from 'semver';

vi.mock('os', () => ({
  default: { homedir: vi.fn() },
  homedir: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: { realpath: vi.fn() },
}));

vi.mock('semver', () => ({
  default: {
    major: vi.fn(),
  },
  major: vi.fn(),
}));

describe('getUserStartupWarnings', () => {
  const homeDir = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(fs.realpath).mockImplementation(async (path) => path.toString());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('home directory check', () => {
    it('should return a warning when running in home directory', async () => {
      vi.mocked(fs.realpath)
        .mockResolvedValueOnce(homeDir)
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings(homeDir);

      expect(warnings).toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('should not return a warning when running in a project directory', async () => {
      vi.mocked(fs.realpath)
        .mockResolvedValueOnce('/some/project/path')
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings('/some/project/path');
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('should handle errors when checking directory', async () => {
      vi.mocked(fs.realpath)
        .mockRejectedValueOnce(new Error('FS error'))
        .mockResolvedValueOnce(homeDir);

      const warnings = await getUserStartupWarnings('/error/path');
      expect(warnings).toContainEqual(
        expect.stringContaining('Could not verify'),
      );
    });
  });

  function setNodeVersionMajor(majorVersion: number) {
    vi.mocked(semver.major).mockReturnValue(majorVersion);
  }

  describe('node version check', () => {
    afterEach(() => {
      setNodeVersionMajor(20);
    });

    it('should return a warning if Node.js version is less than minMajor', async () => {
      setNodeVersionMajor(18);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Node.js');
      expect(warnings[0]).toContain('requires Node.js 20 or higher');
    });

    it('should not return a warning if Node.js version is equal to minMajor', async () => {
      setNodeVersionMajor(20);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toEqual([]);
    });

    it('should not return a warning if Node.js version is greater than minMajor', async () => {
      setNodeVersionMajor(22);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toEqual([]);
    });

    it('should use default minMajor=20 if not provided', async () => {
      setNodeVersionMajor(18);
      const warnings = await getUserStartupWarnings('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Node.js');
      expect(warnings[0]).toContain('requires Node.js 20 or higher');
    });
  });

  // // Example of how to add a new check:
  // describe('node version check', () => {
  //   // Tests for node version check would go here
  //   // This shows how easy it is to add new test sections
  // });
});
