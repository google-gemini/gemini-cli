/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { isGitRepository, findGitRoot } from './gitUtils.js';

describe('gitUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isGitRepository', () => {
    it('returns true if directory is a git repository', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      expect(isGitRepository(tempDir)).toBe(true);
    });

    it('returns true if a parent directory is a git repository', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      const subDir = path.join(tempDir, 'sub', 'dir');
      fs.mkdirSync(subDir, { recursive: true });
      expect(isGitRepository(subDir)).toBe(true);
    });

    it('returns false if directory is not a git repository', () => {
      expect(isGitRepository(tempDir)).toBe(false);
    });

    it('returns true if .git is a file (e.g. git worktree)', () => {
      fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path/.git');
      expect(isGitRepository(tempDir)).toBe(true);
    });

    it('returns false on filesystem error or invalid input', () => {
      // Force an error to trigger the catch block by passing an invalid type
      // path.resolve throws a TypeError when given a non-string
      expect(isGitRepository(123 as unknown as string)).toBe(false);
    });
  });

  describe('findGitRoot', () => {
    it('returns the directory if it is a git root', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      expect(findGitRoot(tempDir)).toBe(path.resolve(tempDir));
    });

    it('returns the git root when called from a subdirectory', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      const subDir = path.join(tempDir, 'sub', 'dir');
      fs.mkdirSync(subDir, { recursive: true });
      expect(findGitRoot(subDir)).toBe(path.resolve(tempDir));
    });

    it('returns null if not in a git repository', () => {
      expect(findGitRoot(tempDir)).toBeNull();
    });

    it('returns the git root when .git is a file (e.g. git worktree)', () => {
      fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path/.git');
      expect(findGitRoot(tempDir)).toBe(path.resolve(tempDir));
    });

    it('returns null on filesystem error or invalid input', () => {
      // Force an error to trigger the catch block by passing an invalid type
      expect(findGitRoot(123 as unknown as string)).toBeNull();
    });
  });
});
