/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import * as fs from 'fs';
import * as path from 'path';
import { isGitRepository } from './gitUtils.js';

// Mock fs module
vi.mock('fs');

// Mock gitUtils module
vi.mock('./gitUtils.js');

describe('GitIgnoreParser', () => {
  let parser: GitIgnoreParser;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    parser = new GitIgnoreParser(mockProjectRoot);
    // Reset mocks before each test
    vi.mocked(fs.readFileSync).mockClear();
    vi.mocked(isGitRepository).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize without errors when no .gitignore exists', () => {
      expect(() => parser.loadGitRepoPatterns()).not.toThrow();
    });

    it('should load .gitignore patterns when file exists', () => {
      const gitignoreContent = `
# Comment
node_modules/
*.log
/dist
.env
`;
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);

      parser.loadGitRepoPatterns();

      expect(parser.getPatterns()).toEqual([
        '.git',
        'node_modules/',
        '*.log',
        '/dist',
        '.env',
      ]);
      expect(parser.isIgnored('node_modules/some-lib')).toBe(true);
      expect(parser.isIgnored('src/app.log')).toBe(true);
      expect(parser.isIgnored('dist/index.js')).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
    });

    it('should handle git exclude file', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (
          filePath === path.join(mockProjectRoot, '.git', 'info', 'exclude')
        ) {
          return 'temp/\n*.tmp';
        }
        throw new Error('ENOENT');
      });

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', 'temp/', '*.tmp']);
      expect(parser.isIgnored('temp/file.txt')).toBe(true);
      expect(parser.isIgnored('src/file.tmp')).toBe(true);
    });

    it('should handle custom patterns file name', () => {
      vi.mocked(isGitRepository).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(mockProjectRoot, '.geminiignore')) {
          return 'temp/\n*.tmp';
        }
        throw new Error('ENOENT');
      });

      parser.loadPatterns('.geminiignore');
      expect(parser.getPatterns()).toEqual(['temp/', '*.tmp']);
      expect(parser.isIgnored('temp/file.txt')).toBe(true);
      expect(parser.isIgnored('src/file.tmp')).toBe(true);
    });

    it('should initialize without errors when no .geminiignore exists', () => {
      expect(() => parser.loadPatterns('.geminiignore')).not.toThrow();
    });
  });

  describe('isIgnored', () => {
    beforeEach(() => {
      const gitignoreContent = `
node_modules/
*.log
/dist
/.env
src/*.tmp
!src/important.tmp
`;
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);
      parser.loadGitRepoPatterns();
    });

    it('should always ignore .git directory', () => {
      expect(parser.isIgnored('.git')).toBe(true);
      expect(parser.isIgnored('.git/config')).toBe(true);
      expect(parser.isIgnored(path.join(mockProjectRoot, '.git', 'HEAD'))).toBe(
        true,
      );
    });

    it('should ignore files matching patterns', () => {
      expect(parser.isIgnored('node_modules/package/index.js')).toBe(true);
      expect(parser.isIgnored('app.log')).toBe(true);
      expect(parser.isIgnored('logs/app.log')).toBe(true);
      expect(parser.isIgnored('dist/bundle.js')).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
      expect(parser.isIgnored('config/.env')).toBe(false); // .env is anchored to root
    });

    it('should ignore files with path-specific patterns', () => {
      expect(parser.isIgnored('src/temp.tmp')).toBe(true);
      expect(parser.isIgnored('other/temp.tmp')).toBe(false);
    });

    it('should handle negation patterns', () => {
      expect(parser.isIgnored('src/important.tmp')).toBe(false);
    });

    it('should not ignore files that do not match patterns', () => {
      expect(parser.isIgnored('src/index.ts')).toBe(false);
      expect(parser.isIgnored('README.md')).toBe(false);
    });

    it('should handle absolute paths correctly', () => {
      const absolutePath = path.join(mockProjectRoot, 'node_modules', 'lib');
      expect(parser.isIgnored(absolutePath)).toBe(true);
    });

    it('should handle paths outside project root by not ignoring them', () => {
      const outsidePath = path.resolve(mockProjectRoot, '../other/file.txt');
      expect(parser.isIgnored(outsidePath)).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      expect(parser.isIgnored('node_modules/some-package')).toBe(true);
      expect(parser.isIgnored('../some/other/file.txt')).toBe(false);
    });

    it('should normalize path separators on Windows', () => {
      expect(parser.isIgnored('node_modules\\package')).toBe(true);
      expect(parser.isIgnored('src\\temp.tmp')).toBe(true);
    });
  });

  describe('getIgnoredPatterns', () => {
    it('should return the raw patterns added', () => {
      const gitignoreContent = '*.log\n!important.log';
      vi.mocked(fs.readFileSync).mockReturnValueOnce(gitignoreContent);

      parser.loadGitRepoPatterns();
      expect(parser.getPatterns()).toEqual(['.git', '*.log', '!important.log']);
    });
  });
});
