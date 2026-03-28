/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isGitRepository, findGitRoot } from './gitUtils.js';

describe('gitUtils', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitutils-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe('isGitRepository', () => {
    it('should return true for a directory containing .git', () => {
      const dir = createTempDir();
      fs.mkdirSync(path.join(dir, '.git'));

      expect(isGitRepository(dir)).toBe(true);
    });

    it('should return true for a nested child of a git repo', () => {
      const dir = createTempDir();
      fs.mkdirSync(path.join(dir, '.git'));
      const nested = path.join(dir, 'a', 'b', 'c');
      fs.mkdirSync(nested, { recursive: true });

      expect(isGitRepository(nested)).toBe(true);
    });

    it('should return false for a directory without .git', () => {
      const dir = createTempDir();

      expect(isGitRepository(dir)).toBe(false);
    });

    it('should return false for a non-existent path', () => {
      expect(isGitRepository('/tmp/nonexistent-path-gitutils-test')).toBe(
        false,
      );
    });
  });

  describe('findGitRoot', () => {
    it('should return the root path when .git exists', () => {
      const dir = createTempDir();
      fs.mkdirSync(path.join(dir, '.git'));

      expect(findGitRoot(dir)).toBe(dir);
    });

    it('should return the correct root from a nested subdirectory', () => {
      const dir = createTempDir();
      fs.mkdirSync(path.join(dir, '.git'));
      const nested = path.join(dir, 'a', 'b', 'c');
      fs.mkdirSync(nested, { recursive: true });

      expect(findGitRoot(nested)).toBe(dir);
    });

    it('should return null for a directory without .git', () => {
      const dir = createTempDir();

      expect(findGitRoot(dir)).toBeNull();
    });

    it('should return null for a non-existent path', () => {
      expect(findGitRoot('/tmp/nonexistent-path-gitutils-test')).toBeNull();
    });
  });
});
