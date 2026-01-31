/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
} from '../config/trustedFolders.js';

// Mock os.homedir to control the home directory in tests
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => os.homedir(),
  };
});

vi.mock('../config/trustedFolders.js', () => ({
  isFolderTrustEnabled: vi.fn(),
  isWorkspaceTrusted: vi.fn(),
}));

describe('getUserStartupWarnings', () => {
  let testRootDir: string;
  let homeDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'warnings-test-'));
    homeDir = path.join(testRootDir, 'home');
    await fs.mkdir(homeDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(isFolderTrustEnabled).mockReturnValue(false);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: undefined,
    });
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('home directory check', () => {
    it('should return a warning when running in home directory', async () => {
      const warnings = await getUserStartupWarnings({}, homeDir);
      expect(warnings).toContainEqual(
        expect.stringContaining(
          'Warning you are running Gemini CLI in your home directory',
        ),
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('warning can be disabled in /settings'),
      );
    });

    it('should not return a warning when running in a project directory', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings({}, projectDir);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('should not return a warning when showHomeDirectoryWarning is false', async () => {
      const warnings = await getUserStartupWarnings(
        { ui: { showHomeDirectoryWarning: false } },
        homeDir,
      );
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('should not return a warning when folder trust is enabled and workspace is trusted', async () => {
      vi.mocked(isFolderTrustEnabled).mockReturnValue(true);
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: true,
        source: 'file',
      });

      const warnings = await getUserStartupWarnings({}, homeDir);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });
  });

  describe('root directory check', () => {
    it('should return a warning when running in a root directory', async () => {
      const rootDir = path.parse(testRootDir).root;
      const warnings = await getUserStartupWarnings({}, rootDir);
      expect(warnings).toContainEqual(
        expect.stringContaining('root directory'),
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('folder structure will be used'),
      );
    });

    it('should not return a warning when running in a non-root directory', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings({}, projectDir);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('root directory'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors when checking directory', async () => {
      const nonExistentPath = path.join(testRootDir, 'non-existent');
      const warnings = await getUserStartupWarnings({}, nonExistentPath);
      const expectedWarning =
        'Could not verify the current directory due to a file system error.';
      expect(warnings).toEqual([expectedWarning, expectedWarning]);
    });
  });
});
