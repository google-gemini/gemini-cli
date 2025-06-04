/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises');

// Mock gitUtils module
vi.mock('./gitUtils.js', () => ({
  isGitRepository: vi.fn(() => true),
  findGitRoot: vi.fn(() => '/test/project'),
}));

describe('GitIgnoreParser', () => {
  let parser: GitIgnoreParser;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    parser = new GitIgnoreParser(mockProjectRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize without errors when no .gitignore exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await expect(parser.initialize()).resolves.not.toThrow();
    });

    it('should load .gitignore patterns when file exists', async () => {
      const gitignoreContent = `
# Comment
node_modules/
*.log
dist
.env
`;
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('.git/**');
      expect(patterns).toContain('.git');
      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('**/*.log');
      expect(patterns).toContain('**/dist');
      expect(patterns).toContain('**/.env');
    });

    it('should handle git exclude file', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(mockProjectRoot, '.gitignore')) {
          throw new Error('ENOENT');
        }
        if (
          filePath === path.join(mockProjectRoot, '.git', 'info', 'exclude')
        ) {
          return 'temp/\n*.tmp';
        }
        throw new Error('Unexpected file');
      });

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('temp/**');
      expect(patterns).toContain('**/*.tmp');
    });
  });

  describe('pattern parsing', () => {
    it('should handle directory patterns correctly', async () => {
      const gitignoreContent = 'node_modules/\nbuild/\n';
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('build/**');
    });

    it('should handle file patterns correctly', async () => {
      const gitignoreContent = '*.log\n.env\nconfig.json\n';
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('**/*.log');
      expect(patterns).toContain('**/.env');
      expect(patterns).toContain('**/config.json');
    });

    it('should skip comments and empty lines', async () => {
      const gitignoreContent = `
# This is a comment
*.log

# Another comment
.env
`;
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).not.toContain('# This is a comment');
      expect(patterns).not.toContain('# Another comment');
      expect(patterns).toContain('**/*.log');
      expect(patterns).toContain('**/.env');
    });

    it('should skip negation patterns for now', async () => {
      const gitignoreContent = '*.log\n!important.log\n';
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('**/*.log');
      expect(patterns).not.toContain('!important.log');
    });

    it('should handle paths with slashes correctly', async () => {
      const gitignoreContent = 'src/*.log\ndocs/temp/\n';
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('src/*.log');
      expect(patterns).toContain('docs/temp/**');
    });
  });

  describe('isIgnored', () => {
    beforeEach(async () => {
      const gitignoreContent = `
node_modules/
*.log
dist
.env
src/*.tmp
`;
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);
      await parser.initialize();
    });

    it('should always ignore .git directory', () => {
      expect(parser.isIgnored('.git')).toBe(true);
      expect(parser.isIgnored('.git/config')).toBe(true);
      expect(parser.isIgnored('.git/objects/abc123')).toBe(true);
    });

    it('should ignore files matching patterns', () => {
      expect(parser.isIgnored('node_modules')).toBe(true);
      expect(parser.isIgnored('node_modules/package')).toBe(true);
      expect(parser.isIgnored('app.log')).toBe(true);
      expect(parser.isIgnored('logs/app.log')).toBe(true);
      expect(parser.isIgnored('dist')).toBe(true);
      expect(parser.isIgnored('.env')).toBe(true);
      expect(parser.isIgnored('config/.env')).toBe(true);
    });

    it('should ignore files with path-specific patterns', () => {
      expect(parser.isIgnored('src/temp.tmp')).toBe(true);
      expect(parser.isIgnored('other/temp.tmp')).toBe(false);
    });

    it('should not ignore files that do not match patterns', () => {
      expect(parser.isIgnored('src/index.ts')).toBe(false);
      expect(parser.isIgnored('README.md')).toBe(false);
      expect(parser.isIgnored('package.json')).toBe(false);
    });

    it('should handle absolute paths correctly', () => {
      const absolutePath = path.join(
        mockProjectRoot,
        'node_modules',
        'package',
      );
      expect(parser.isIgnored(absolutePath)).toBe(true);
    });

    it('should handle paths outside project root', () => {
      const outsidePath = '/other/project/file.txt';
      expect(parser.isIgnored(outsidePath)).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      expect(parser.isIgnored('./node_modules')).toBe(true);
      expect(parser.isIgnored('../file.txt')).toBe(false);
    });

    it('should normalize path separators on Windows', () => {
      expect(parser.isIgnored('node_modules\\package')).toBe(true);
      expect(parser.isIgnored('src\\temp.tmp')).toBe(true);
    });
  });

  describe('getIgnoredPatterns', () => {
    it('should return a copy of patterns array', async () => {
      const gitignoreContent = '*.log\n';
      vi.mocked(fs.readFile).mockResolvedValue(gitignoreContent);

      await parser.initialize();
      const patterns1 = parser.getIgnoredPatterns();
      const patterns2 = parser.getIgnoredPatterns();

      expect(patterns1).not.toBe(patterns2); // Different array instances
      expect(patterns1).toEqual(patterns2); // Same content
    });

    it('should always include .git patterns', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      await parser.initialize();
      const patterns = parser.getIgnoredPatterns();

      expect(patterns).toContain('.git/**');
      expect(patterns).toContain('.git');
    });
  });
});
