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

  describe('initialization', () => {
    it('should initialize without errors when no .gitignore exists', async () => {
      await setupGitRepo();
      expect(() => parser.loadGitRepoPatterns()).not.toThrow();
    });

    it('should load .gitignore patterns when file exists', async () => {
      await setupGitRepo();
      const gitignoreContent = `
# Comment
node_modules/
*.log
/dist
.env
`;
      await createTestFile('.gitignore', gitignoreContent);

      parser.loadGitRepoPatterns();

      expect(parser.getPatterns()).toEqual([
        '.git',
        'node_modules/',
        '*.log',
        '/dist',
        '.env',
      ]);
      expect(parser.isIgnored(path.join('node_modules', 'some-lib'))).toBe(
        true,
      );
      expect(parser.isIgnored(path.join('src', 'app.log'))).toBe(true);
      expect(parser.isIgnored(path.join('dist', 'index.js'))).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
    });

    it('should handle git exclude file', async () => {
      await setupGitRepo();
      await createTestFile(
        path.join('.git', 'info', 'exclude'),
        'temp/\n*.tmp',
      );

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', 'temp/', '*.tmp']);
      expect(parser.isIgnored(path.join('temp', 'file.txt'))).toBe(true);
      expect(parser.isIgnored(path.join('src', 'file.tmp'))).toBe(true);
    });

    it('should handle custom patterns file name', async () => {
      // No .git directory for this test
      await createTestFile('.geminiignore', 'temp/\n*.tmp');

      parser.loadPatterns('.geminiignore');
      expect(parser.getPatterns()).toEqual(['temp/', '*.tmp']);
      expect(parser.isIgnored(path.join('temp', 'file.txt'))).toBe(true);
      expect(parser.isIgnored(path.join('src', 'file.tmp'))).toBe(true);
    });

    it('should initialize without errors when no .geminiignore exists', () => {
      expect(() => parser.loadPatterns('.geminiignore')).not.toThrow();
    });
  });

  describe('isIgnored', () => {
    beforeEach(async () => {
      await setupGitRepo();
      const gitignoreContent = `
node_modules/
*.log
/dist
/.env
src/*.tmp
!src/important.tmp
`;
      await createTestFile('.gitignore', gitignoreContent);
      parser.loadGitRepoPatterns();
    });

    it('should always ignore .git directory', () => {
      expect(parser.isIgnored('.git')).toBe(true);
      expect(parser.isIgnored(path.join('.git', 'config'))).toBe(true);
      expect(parser.isIgnored(path.join(projectRoot, '.git', 'HEAD'))).toBe(
        true,
      );
    });

    it('should ignore files matching patterns', () => {
      expect(
        parser.isIgnored(path.join('node_modules', 'package', 'index.js')),
      ).toBe(true);
      expect(parser.isIgnored('app.log')).toBe(true);
      expect(parser.isIgnored(path.join('logs', 'app.log'))).toBe(true);
      expect(parser.isIgnored(path.join('dist', 'bundle.js'))).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
      expect(parser.isIgnored(path.join('config', '.env'))).toBe(false); // .env is anchored to root
    });

    it('should ignore files with path-specific patterns', () => {
      expect(parser.isIgnored(path.join('src', 'temp.tmp'))).toBe(true);
      expect(parser.isIgnored(path.join('other', 'temp.tmp'))).toBe(false);
    });

    it('should handle negation patterns', () => {
      expect(parser.isIgnored(path.join('src', 'important.tmp'))).toBe(false);
    });

    it('should not ignore files that do not match patterns', () => {
      expect(parser.isIgnored(path.join('src', 'index.ts'))).toBe(false);
      expect(parser.isIgnored('README.md')).toBe(false);
    });

    it('should handle absolute paths correctly', () => {
      const absolutePath = path.join(projectRoot, 'node_modules', 'lib');
      expect(parser.isIgnored(absolutePath)).toBe(true);
    });

    it('should handle paths outside project root by not ignoring them', () => {
      const outsidePath = path.resolve(projectRoot, '..', 'other', 'file.txt');
      expect(parser.isIgnored(outsidePath)).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      expect(parser.isIgnored(path.join('node_modules', 'some-package'))).toBe(
        true,
      );
      expect(
        parser.isIgnored(path.join('..', 'some', 'other', 'file.txt')),
      ).toBe(false);
    });

    it('should normalize path separators on Windows', () => {
      expect(parser.isIgnored(path.join('node_modules', 'package'))).toBe(true);
      expect(parser.isIgnored(path.join('src', 'temp.tmp'))).toBe(true);
    });

    it('should handle root path "/" without throwing error', () => {
      expect(() => parser.isIgnored('/')).not.toThrow();
      expect(parser.isIgnored('/')).toBe(false);
    });

    it('should handle absolute-like paths without throwing error', () => {
      expect(() => parser.isIgnored('/some/path')).not.toThrow();
      expect(parser.isIgnored('/some/path')).toBe(false);
    });

    it('should handle paths that start with forward slash', () => {
      expect(() => parser.isIgnored('/node_modules')).not.toThrow();
      expect(parser.isIgnored('/node_modules')).toBe(false);
    });

    it('should handle backslash-prefixed files without crashing', () => {
      expect(() => parser.isIgnored('\\backslash-file-test.txt')).not.toThrow();
      expect(parser.isIgnored('\\backslash-file-test.txt')).toBe(false);
    });

    it('should handle files with absolute-like names', () => {
      expect(() => parser.isIgnored('/backslash-file-test.txt')).not.toThrow();
      expect(parser.isIgnored('/backslash-file-test.txt')).toBe(false);
    });
  });

  describe('nested .gitignore files', () => {
    beforeEach(async () => {
      await setupGitRepo();
      // Root .gitignore
      await createTestFile('.gitignore', 'root-ignored.txt');
      // Nested .gitignore 1
      await createTestFile('a/.gitignore', '/b\nc');
      // Nested .gitignore 2
      await createTestFile('a/d/.gitignore', 'e.txt\nf/g');
    });

    it('should handle nested .gitignore files correctly', async () => {
      parser.loadGitRepoPatterns();

      // From root .gitignore
      expect(parser.isIgnored('root-ignored.txt')).toBe(true);
      expect(parser.isIgnored('a/root-ignored.txt')).toBe(true);

      // From a/.gitignore: /b
      expect(parser.isIgnored('a/b')).toBe(true);
      expect(parser.isIgnored('b')).toBe(false);
      expect(parser.isIgnored('a/x/b')).toBe(false);

      // From a/.gitignore: c
      expect(parser.isIgnored('a/c')).toBe(true);
      expect(parser.isIgnored('a/x/y/c')).toBe(true);
      expect(parser.isIgnored('c')).toBe(false);

      // From a/d/.gitignore: e.txt
      expect(parser.isIgnored('a/d/e.txt')).toBe(true);
      expect(parser.isIgnored('a/d/x/e.txt')).toBe(true);
      expect(parser.isIgnored('a/e.txt')).toBe(false);

      // From a/d/.gitignore: f/g
      expect(parser.isIgnored('a/d/f/g')).toBe(true);
      expect(parser.isIgnored('a/f/g')).toBe(false);
    });

    it('should correctly transform patterns from nested gitignore files', () => {
      parser.loadGitRepoPatterns();
      const patterns = parser.getPatterns();

      // From root .gitignore
      expect(patterns).toContain('root-ignored.txt');

      // From a/.gitignore
      expect(patterns).toContain('/a/b'); // /b becomes /a/b
      expect(patterns).toContain('/a/**/c'); // c becomes /a/**/c

      // From a/d/.gitignore
      expect(patterns).toContain('/a/d/**/e.txt'); // e.txt becomes /a/d/**/e.txt
      expect(patterns).toContain('/a/d/f/g'); // f/g becomes /a/d/f/g
    });
  });

  describe('precedence rules', () => {
    it('should prioritize root .gitignore over .git/info/exclude', async () => {
      await setupGitRepo();
      // Exclude all .log files
      await createTestFile(path.join('.git', 'info', 'exclude'), '*.log');
      // But make an exception in the root .gitignore
      await createTestFile('.gitignore', '!important.log');

      parser.loadGitRepoPatterns();

      expect(parser.isIgnored('some.log')).toBe(true);
      expect(parser.isIgnored('important.log')).toBe(false);
      expect(parser.isIgnored(path.join('subdir', 'some.log'))).toBe(true);
      expect(parser.isIgnored(path.join('subdir', 'important.log'))).toBe(
        false,
      );
    });
  });

  describe('getIgnoredPatterns', () => {
    it('should return the raw patterns added', async () => {
      await setupGitRepo();
      const gitignoreContent = '*.log\n!important.log';
      await createTestFile('.gitignore', gitignoreContent);

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', '*.log', '!important.log']);
    });
  });
});
