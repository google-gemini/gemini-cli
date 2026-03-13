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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-git-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('isGitRepository', () => {
    it('returns true when .git directory exists', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      expect(isGitRepository(tempDir)).toBe(true);
    });

    it('returns true when .git file exists (worktree)', () => {
      fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/other/path');
      expect(isGitRepository(tempDir)).toBe(true);
    });

    it('returns true for a subdirectory inside a git repo', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      const subDir = path.join(tempDir, 'src', 'utils');
      fs.mkdirSync(subDir, { recursive: true });
      expect(isGitRepository(subDir)).toBe(true);
    });

    it('returns false when no .git exists in directory tree', () => {
      const noGitDir = path.join(tempDir, 'no-git');
      fs.mkdirSync(noGitDir);
      expect(isGitRepository(noGitDir)).toBe(false);
    });

    it('returns false for a non-existent directory', () => {
      expect(isGitRepository(path.join(tempDir, 'does-not-exist'))).toBe(false);
    });
  });

  describe('findGitRoot', () => {
    it('returns the directory containing .git', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      expect(findGitRoot(tempDir)).toBe(tempDir);
    });

    it('returns the parent directory when searching from a subdirectory', () => {
      fs.mkdirSync(path.join(tempDir, '.git'));
      const subDir = path.join(tempDir, 'packages', 'core');
      fs.mkdirSync(subDir, { recursive: true });
      expect(findGitRoot(subDir)).toBe(tempDir);
    });

    it('returns null when no .git exists', () => {
      const noGitDir = path.join(tempDir, 'no-git');
      fs.mkdirSync(noGitDir);
      expect(findGitRoot(noGitDir)).toBeNull();
    });

    it('returns null for a non-existent directory', () => {
      expect(findGitRoot(path.join(tempDir, 'does-not-exist'))).toBeNull();
    });

    it('handles .git file (worktree) the same as .git directory', () => {
      fs.writeFileSync(
        path.join(tempDir, '.git'),
        'gitdir: /some/worktree/path',
      );
      expect(findGitRoot(tempDir)).toBe(tempDir);
    });
  });
});
