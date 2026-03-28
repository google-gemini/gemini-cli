/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { isGitRepository, findGitRoot } from './gitUtils.js';

/**
 * Helper to create a temporary directory for each test.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gitutils-test-'));
}

describe('isGitRepository', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true when .git directory exists', () => {
    fs.mkdirSync(path.join(tempDir, '.git'));
    expect(isGitRepository(tempDir)).toBe(true);
  });

  it('returns true when .git is a file (worktree)', () => {
    fs.writeFileSync(
      path.join(tempDir, '.git'),
      'gitdir: /some/other/path/.git/worktrees/branch',
    );
    expect(isGitRepository(tempDir)).toBe(true);
  });

  it('returns true for a subdirectory inside a git repo', () => {
    fs.mkdirSync(path.join(tempDir, '.git'));
    const subDir = path.join(tempDir, 'src', 'utils');
    fs.mkdirSync(subDir, { recursive: true });
    expect(isGitRepository(subDir)).toBe(true);
  });

  it('returns false when no .git exists', () => {
    expect(isGitRepository(tempDir)).toBe(false);
  });

  it('returns false for a non-existent directory', () => {
    expect(isGitRepository(path.join(tempDir, 'nonexistent'))).toBe(false);
  });

  it('returns false for an empty string path when CWD is not a git repo', () => {
    const originalCwd = process.cwd();
    try {
      // Change to a directory known to not be a git repo
      process.chdir(tempDir);
      expect(isGitRepository('')).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('findGitRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns the directory containing .git', () => {
    fs.mkdirSync(path.join(tempDir, '.git'));
    expect(findGitRoot(tempDir)).toBe(tempDir);
  });

  it('returns the root when called from a nested subdirectory', () => {
    fs.mkdirSync(path.join(tempDir, '.git'));
    const deepDir = path.join(tempDir, 'a', 'b', 'c');
    fs.mkdirSync(deepDir, { recursive: true });
    expect(findGitRoot(deepDir)).toBe(tempDir);
  });

  it('returns the correct root with a .git file (worktree)', () => {
    fs.writeFileSync(
      path.join(tempDir, '.git'),
      'gitdir: /some/other/path/.git/worktrees/branch',
    );
    expect(findGitRoot(tempDir)).toBe(tempDir);
  });

  it('returns null when not in a git repository', () => {
    expect(findGitRoot(tempDir)).toBe(null);
  });

  it('returns null for a non-existent directory', () => {
    expect(findGitRoot(path.join(tempDir, 'nonexistent'))).toBe(null);
  });

  it('finds the nearest .git, not a parent one', () => {
    // Create nested git repos
    const innerRepo = path.join(tempDir, 'inner');
    fs.mkdirSync(path.join(tempDir, '.git'));
    fs.mkdirSync(innerRepo);
    fs.mkdirSync(path.join(innerRepo, '.git'));

    const deepInInner = path.join(innerRepo, 'src');
    fs.mkdirSync(deepInInner);
    expect(findGitRoot(deepInInner)).toBe(innerRepo);
  });
});
