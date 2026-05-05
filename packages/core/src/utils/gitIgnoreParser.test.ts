/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('GitIgnoreParser', () => {
  let parser: GitIgnoreParser;
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  async function setupGitRepo() {
    await fs.mkdir(path.join(projectRoot, '.git'), { recursive: true });
  }

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-test-'));
    parser = new GitIgnoreParser(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('Core Git Logic', () => {
    beforeEach(async () => {
      await setupGitRepo();
    });

    it('should identify paths ignored by the root .gitignore', async () => {
      await createTestFile('.gitignore', 'node_modules/\n*.log\n/dist\n.env');

      expect(parser.isIgnored('node_modules/package/index.js', false)).toBe(
        true,
      );
      expect(parser.isIgnored('src/app.log', false)).toBe(true);
      expect(parser.isIgnored('dist/bundle.js', false)).toBe(true);
      expect(parser.isIgnored('.env', false)).toBe(true);
      expect(parser.isIgnored('src/index.js', false)).toBe(false);
    });

    it('should identify paths ignored by .git/info/exclude', async () => {
      await createTestFile(
        path.join('.git', 'info', 'exclude'),
        'temp/\n*.tmp',
      );
      expect(parser.isIgnored('temp/file.txt', false)).toBe(true);
      expect(parser.isIgnored('src/file.tmp', false)).toBe(true);
    });

    it('should identify the .git directory as ignored regardless of patterns', () => {
      expect(parser.isIgnored('.git', true)).toBe(true);
      expect(parser.isIgnored('.git/config', false)).toBe(true);
    });

    it('should identify ignored directories when explicitly flagged', async () => {
      await createTestFile('.gitignore', 'dist/');
      expect(parser.isIgnored('dist', true)).toBe(true);
      expect(parser.isIgnored('dist', false)).toBe(false);
    });
  });

  describe('Nested .gitignore precedence', () => {
    beforeEach(async () => {
      await setupGitRepo();
      await createTestFile('.gitignore', '*.log\n/ignored-at-root/');
      await createTestFile(
        'subdir/.gitignore',
        '!special.log\nfile-in-subdir.txt',
      );
    });

    it('should prioritize nested rules over root rules', () => {
      expect(parser.isIgnored('any.log', false)).toBe(true);
      expect(parser.isIgnored('subdir/any.log', false)).toBe(true);
      expect(parser.isIgnored('subdir/special.log', false)).toBe(false);
    });

    it('should correctly anchor nested patterns', () => {
      expect(parser.isIgnored('subdir/file-in-subdir.txt', false)).toBe(true);
      expect(parser.isIgnored('file-in-subdir.txt', false)).toBe(false);
    });

    it('should stop processing if an ancestor directory is ignored', async () => {
      await createTestFile(
        'ignored-at-root/.gitignore',
        '!should-not-work.txt',
      );
      await createTestFile('ignored-at-root/should-not-work.txt', 'content');

      expect(
        parser.isIgnored('ignored-at-root/should-not-work.txt', false),
      ).toBe(true);
    });
  });

  describe('Advanced Pattern Matching', () => {
    beforeEach(async () => {
      await setupGitRepo();
    });

    it('should handle complex negation and directory rules', async () => {
      await createTestFile('.gitignore', 'docs/*\n!docs/README.md');

      expect(parser.isIgnored('docs/other.txt', false)).toBe(true);
      expect(parser.isIgnored('docs/README.md', false)).toBe(false);
      expect(parser.isIgnored('docs/', true)).toBe(false);
    });

    it('should handle escaped characters like # and !', async () => {
      await createTestFile('.gitignore', '\\#hashfile\n\\!exclaim');
      expect(parser.isIgnored('#hashfile', false)).toBe(true);
      expect(parser.isIgnored('!exclaim', false)).toBe(true);
    });

    it('should correctly handle significant trailing spaces', async () => {
      await createTestFile('.gitignore', 'foo\\ \nbar ');

      expect(parser.isIgnored('foo ', false)).toBe(true);
      expect(parser.isIgnored('bar', false)).toBe(true);
      expect(parser.isIgnored('bar ', false)).toBe(false);
    });
  });

  describe('Extra Patterns (Constructor-passed)', () => {
    it('should apply extraPatterns with highest precedence', async () => {
      await createTestFile('.gitignore', '*.txt');
      parser = new GitIgnoreParser(projectRoot, ['!important.txt', 'temp/']);

      expect(parser.isIgnored('file.txt', false)).toBe(true);
      expect(parser.isIgnored('important.txt', false)).toBe(false);
      expect(parser.isIgnored('temp/anything.js', false)).toBe(true);
    });
  });
});
