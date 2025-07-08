/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'os';
import fs from 'fs/promises';

vi.mock('os', () => ({
  default: { homedir: vi.fn() },
  homedir: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: { realpath: vi.fn() },
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

  // // Example of how to add a new check:
  // describe('node version check', () => {
  //   // Tests for node version check would go here
  //   // This shows how easy it is to add new test sections
  // });
});
