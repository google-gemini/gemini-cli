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

describe('IgnoreFileParser', () => {
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ignore-file-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('Basic File Loading', () => {
    it('should identify paths ignored by a single ignore file', async () => {
      await createTestFile(
        GEMINI_IGNORE_FILE_NAME,
        'ignored.txt\n/ignored_dir/',
      );
      const parser = new IgnoreFileParser(projectRoot, GEMINI_IGNORE_FILE_NAME);

      expect(parser.isIgnored('ignored.txt', false)).toBe(true);
      expect(parser.isIgnored('ignored_dir/file.txt', false)).toBe(true);
      expect(parser.isIgnored('keep.txt', false)).toBe(false);
      expect(parser.isIgnored('ignored_dir', true)).toBe(true);
    });

    it('should handle missing or empty ignore files gracefully', () => {
      const parser = new IgnoreFileParser(projectRoot, 'nonexistent.ignore');
      expect(parser.isIgnored('any.txt', false)).toBe(false);
      expect(parser.hasPatterns()).toBe(false);
    });
  });

  describe('Multiple Ignore File Priority', () => {
    const primary = 'primary.ignore';
    const secondary = 'secondary.ignore';

    it('should prioritize patterns from the first file in the input list', async () => {
      // First file un-ignores, second file ignores
      await createTestFile(primary, '!important.log');
      await createTestFile(secondary, '*.log');

      const parser = new IgnoreFileParser(projectRoot, [primary, secondary]);

      expect(parser.isIgnored('other.log', false)).toBe(true);
      expect(parser.isIgnored('important.log', false)).toBe(false);
    });

    it('should return existing ignore file paths in priority order', async () => {
      await createTestFile(primary, 'pattern');
      await createTestFile(secondary, 'pattern');

      const parser = new IgnoreFileParser(projectRoot, [primary, secondary]);
      const paths = parser.getIgnoreFilePaths();
      // Implementation returns in reverse order of processing (first file = highest priority = last processed)
      expect(paths[0]).toBe(path.join(projectRoot, secondary));
      expect(paths[1]).toBe(path.join(projectRoot, primary));
    });
  });

  describe('Direct Pattern Input (isPatterns = true)', () => {
    it('should use raw patterns passed directly in the constructor', () => {
      const parser = new IgnoreFileParser(
        projectRoot,
        ['*.tmp', '!safe.tmp'],
        true,
      );

      expect(parser.isIgnored('temp.tmp', false)).toBe(true);
      expect(parser.isIgnored('safe.tmp', false)).toBe(false);
    });

    it('should return provided patterns via getPatterns()', () => {
      const patterns = ['*.a', '*.b'];
      const parser = new IgnoreFileParser(projectRoot, patterns, true);
      expect(parser.getPatterns()).toEqual(patterns);
    });
  });
});
