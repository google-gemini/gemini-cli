/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IgnoreFileParser } from './ignoreFileParser.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';

describe('GeminiIgnoreParser', () => {
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'geminiignore-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('when .geminiignore exists', () => {
    beforeEach(async () => {
      await createTestFile(
        GEMINI_IGNORE_FILE_NAME,
        'ignored.txt\n# A comment\n/ignored_dir/\n',
      );
      await createTestFile('ignored.txt', 'ignored');
      await createTestFile('not_ignored.txt', 'not ignored');
      await createTestFile(
        path.join('ignored_dir', 'file.txt'),
        'in ignored dir',
      );
      await createTestFile(
        path.join('subdir', 'not_ignored.txt'),
        'not ignored',
      );
    });

    it('should ignore files specified in .geminiignore', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getPatterns()).toEqual(['ignored.txt', '/ignored_dir/']);
      expect(parser.isIgnored('ignored.txt')).toBe(true);
      expect(parser.isIgnored('not_ignored.txt')).toBe(false);
      expect(parser.isIgnored(path.join('ignored_dir', 'file.txt'))).toBe(true);
      expect(parser.isIgnored(path.join('subdir', 'not_ignored.txt'))).toBe(
        false,
      );
    });

    it('should return ignore file path when patterns exist', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getIgnoreFilePaths()).toEqual([
        path.join(projectRoot, GEMINI_IGNORE_FILE_NAME),
      ]);
    });

    it('should return true for hasPatterns when patterns exist', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.hasPatterns()).toBe(true);
    });

    it('should maintain patterns in memory when .geminiignore is deleted', async () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      await fs.rm(path.join(projectRoot, GEMINI_IGNORE_FILE_NAME));
      expect(parser.hasPatterns()).toBe(true);
      expect(parser.getIgnoreFilePaths()).toEqual([]);
    });
  });

  describe('when .geminiignore does not exist', () => {
    it('should not load any patterns and not ignore any files', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getPatterns()).toEqual([]);
      expect(parser.isIgnored('any_file.txt')).toBe(false);
    });

    it('should return empty array for getIgnoreFilePaths when no patterns exist', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getIgnoreFilePaths()).toEqual([]);
    });

    it('should return false for hasPatterns when no patterns exist', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.hasPatterns()).toBe(false);
    });
  });

  describe('when .geminiignore is empty', () => {
    beforeEach(async () => {
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '');
    });

    it('should return file path for getIgnoreFilePaths', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getIgnoreFilePaths()).toEqual([
        path.join(projectRoot, GEMINI_IGNORE_FILE_NAME),
      ]);
    });

    it('should return false for hasPatterns', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.hasPatterns()).toBe(false);
    });
  });

  describe('when .geminiignore only has comments', () => {
    beforeEach(async () => {
      await createTestFile(
        GEMINI_IGNORE_FILE_NAME,
        '# This is a comment\n# Another comment\n',
      );
    });

    it('should return file path for getIgnoreFilePaths', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.getIgnoreFilePaths()).toEqual([
        path.join(projectRoot, GEMINI_IGNORE_FILE_NAME),
      ]);
    });

    it('should return false for hasPatterns', () => {
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);
      expect(parser.hasPatterns()).toBe(false);
    });
  });

  describe('when multiple ignore files are provided', () => {
    const primaryFile = 'primary.ignore';
    const secondaryFile = 'secondary.ignore';

    beforeEach(async () => {
      await createTestFile(primaryFile, '# Primary\n!important.txt\n');
      await createTestFile(secondaryFile, '# Secondary\n*.txt\n');
      await createTestFile('important.txt', 'important');
      await createTestFile('other.txt', 'other');
    });

    it('should combine patterns from all files', () => {
      const parser = new IgnoreFileParser(projectRoot, [
        primaryFile,
        secondaryFile,
      ]);
      expect(parser.isIgnored('other.txt')).toBe(true);
    });

    it('should respect priority (first file overrides second)', () => {
      const parser = new IgnoreFileParser(projectRoot, [
        primaryFile,
        secondaryFile,
      ]);
      expect(parser.isIgnored('important.txt')).toBe(false);
    });

    it('should return all existing file paths in reverse order', () => {
      const parser = new IgnoreFileParser(projectRoot, [
        'nonexistent.ignore',
        primaryFile,
        secondaryFile,
      ]);
      expect(parser.getIgnoreFilePaths()).toEqual([
        path.join(projectRoot, secondaryFile),
        path.join(projectRoot, primaryFile),
      ]);
    });
  });

  describe('when patterns are passed directly', () => {
    it('should ignore files matching the passed patterns', () => {
      const parser = new IgnoreFileParser(projectRoot, ['*.log'], true);
      expect(parser.isIgnored('debug.log')).toBe(true);
      expect(parser.isIgnored('src/index.ts')).toBe(false);
    });

    it('should handle multiple patterns', () => {
      const parser = new IgnoreFileParser(
        projectRoot,
        ['*.log', 'temp/'],
        true,
      );
      expect(parser.isIgnored('debug.log')).toBe(true);
      expect(parser.isIgnored('temp/file.txt')).toBe(true);
      expect(parser.isIgnored('src/index.ts')).toBe(false);
    });

    it('should respect precedence (later patterns override earlier ones)', () => {
      const parser = new IgnoreFileParser(
        projectRoot,
        ['*.txt', '!important.txt'],
        true,
      );
      expect(parser.isIgnored('file.txt')).toBe(true);
      expect(parser.isIgnored('important.txt')).toBe(false);
    });

    it('should return empty array for getIgnoreFilePaths', () => {
      const parser = new IgnoreFileParser(projectRoot, ['*.log'], true);
      expect(parser.getIgnoreFilePaths()).toEqual([]);
    });

    it('should return patterns via getPatterns', () => {
      const patterns = ['*.log', '!debug.log'];
      const parser = new IgnoreFileParser(projectRoot, patterns, true);
      expect(parser.getPatterns()).toEqual(patterns);
    });
  });
});
