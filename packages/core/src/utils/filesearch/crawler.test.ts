/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as cache from './crawlCache.js';
import { crawl } from './crawler.js';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';
import type { Ignore } from './ignore.js';
import { loadIgnoreRules } from './ignore.js';

describe('crawler', () => {
  let tmpDir: string;
  afterEach(async () => {
    if (tmpDir) {
      await cleanupTmpDir(tmpDir);
    }
    vi.restoreAllMocks();
  });

  it('should use .geminiignore rules', async () => {
    tmpDir = await createTmpDir({
      '.geminiignore': 'dist/',
      dist: ['ignored.js'],
      src: ['not-ignored.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: true,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        '.',
        'src/',
        '.geminiignore',
        'src/not-ignored.js',
      ]),
    );
  });

  it('should combine .gitignore and .geminiignore rules', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': 'dist/',
      '.geminiignore': 'build/',
      dist: ['ignored-by-git.js'],
      build: ['ignored-by-gemini.js'],
      src: ['not-ignored.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        '.',
        'src/',
        '.geminiignore',
        '.gitignore',
        'src/not-ignored.js',
      ]),
    );
  });

  it('should use ignoreDirs option', async () => {
    tmpDir = await createTmpDir({
      logs: ['some.log'],
      src: ['main.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: ['logs'],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining(['.', 'src/', 'src/main.js']),
    );
  });

  it('should handle negated directories', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': ['build/**', '!build/public', '!build/public/**'].join(
        '\n',
      ),
      build: {
        'private.js': '',
        public: ['index.html'],
      },
      src: ['main.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        '.',
        'build/',
        'build/public/',
        'src/',
        '.gitignore',
        'build/public/index.html',
        'src/main.js',
      ]),
    );
  });

  it('should handle root-level file negation', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': ['*.mk', '!Foo.mk'].join('\n'),
      'bar.mk': '',
      'Foo.mk': '',
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining(['.', '.gitignore', 'Foo.mk', 'bar.mk']),
    );
  });

  it('should handle directory negation with glob', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': [
        'third_party/**',
        '!third_party/foo',
        '!third_party/foo/bar',
        '!third_party/foo/bar/baz_buffer',
      ].join('\n'),
      third_party: {
        foo: {
          bar: {
            baz_buffer: '',
          },
        },
        ignore_this: '',
      },
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        '.',
        'third_party/',
        'third_party/foo/',
        'third_party/foo/bar/',
        '.gitignore',
        'third_party/foo/bar/baz_buffer',
      ]),
    );
  });

  it('should correctly handle negated patterns in .gitignore', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': ['dist/**', '!dist/keep.js'].join('\n'),
      dist: ['ignore.js', 'keep.js'],
      src: ['main.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        '.',
        'dist/',
        'src/',
        '.gitignore',
        'dist/keep.js',
        'src/main.js',
      ]),
    );
  });

  it('should initialize correctly when ignore files are missing', async () => {
    tmpDir = await createTmpDir({
      src: ['file1.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });
    expect(results).toEqual(
      expect.arrayContaining(['.', 'src/', 'src/file1.js']),
    );
  });

  it('should handle empty or commented-only ignore files', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': '# This is a comment\n\n   \n',
      src: ['main.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining(['.', 'src/', '.gitignore', 'src/main.js']),
    );
  });

  it('should always ignore the .git directory', async () => {
    tmpDir = await createTmpDir({
      '.git': ['config', 'HEAD'],
      src: ['main.js'],
    });

    const ignore = loadIgnoreRules({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
    });

    const results = await crawl({
      crawlDirectory: tmpDir,
      cwd: tmpDir,
      ignore,
      cache: false,
      cacheTtl: 0,
    });

    expect(results).toEqual(
      expect.arrayContaining(['.', 'src/', 'src/main.js']),
    );
  });

  describe('with in-memory cache', () => {
    beforeEach(() => {
      cache.clear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should hit the cache for subsequent crawls', async () => {
      tmpDir = await createTmpDir({ 'file1.js': '' });
      const ignore = loadIgnoreRules({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
      });
      const options = {
        crawlDirectory: tmpDir,
        cwd: tmpDir,
        ignore,
        cache: true,
        cacheTtl: 10,
      };

      const crawlSpy = vi.spyOn(cache, 'read');

      await crawl(options);
      expect(crawlSpy).toHaveBeenCalledTimes(1);

      await crawl(options);
      expect(crawlSpy).toHaveBeenCalledTimes(2);
      // fdir should not have been called a second time.
      // We can't spy on it directly, but we can check the cache was hit.
      const cacheKey = cache.getCacheKey(
        options.crawlDirectory,
        options.ignore.getFingerprint(),
        undefined,
      );
      expect(cache.read(cacheKey)).toBeDefined();
    });

    it('should miss the cache when ignore rules change', async () => {
      tmpDir = await createTmpDir({
        '.gitignore': 'a.txt',
        'a.txt': '',
        'b.txt': '',
      });
      const getIgnore = () =>
        loadIgnoreRules({
          projectRoot: tmpDir,
          useGitignore: true,
          useGeminiignore: false,
          ignoreDirs: [],
        });
      const getOptions = (ignore: Ignore) => ({
        crawlDirectory: tmpDir,
        cwd: tmpDir,
        ignore,
        cache: true,
        cacheTtl: 10000,
      });

      // Initial crawl to populate the cache
      const ignore1 = getIgnore();
      const results1 = await crawl(getOptions(ignore1));
      expect(results1).toEqual(
        expect.arrayContaining(['.', '.gitignore', 'b.txt']),
      );

      // Modify the ignore file
      await fs.writeFile(path.join(tmpDir, '.gitignore'), 'b.txt');

      // Second crawl should miss the cache and trigger a recrawl
      const ignore2 = getIgnore();
      const results2 = await crawl(getOptions(ignore2));
      expect(results2).toEqual(
        expect.arrayContaining(['.', '.gitignore', 'a.txt']),
      );
    });

    it('should miss the cache after TTL expires', async () => {
      tmpDir = await createTmpDir({ 'file1.js': '' });
      const ignore = loadIgnoreRules({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
      });
      const options = {
        crawlDirectory: tmpDir,
        cwd: tmpDir,
        ignore,
        cache: true,
        cacheTtl: 10, // 10 seconds
      };

      const readSpy = vi.spyOn(cache, 'read');
      const writeSpy = vi.spyOn(cache, 'write');

      await crawl(options);
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledTimes(1);

      // Advance time past the TTL
      await vi.advanceTimersByTimeAsync(11000);

      await crawl(options);
      expect(readSpy).toHaveBeenCalledTimes(2);
      expect(writeSpy).toHaveBeenCalledTimes(2);
    });

    it('should miss the cache when maxDepth changes', async () => {
      tmpDir = await createTmpDir({ 'file1.js': '' });
      const ignore = loadIgnoreRules({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
      });
      const getOptions = (maxDepth?: number) => ({
        crawlDirectory: tmpDir,
        cwd: tmpDir,
        ignore,
        cache: true,
        cacheTtl: 10000,
        maxDepth,
      });

      const readSpy = vi.spyOn(cache, 'read');
      const writeSpy = vi.spyOn(cache, 'write');

      // 1. First crawl with maxDepth: 1
      await crawl(getOptions(1));
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledTimes(1);

      // 2. Second crawl with maxDepth: 2, should be a cache miss
      await crawl(getOptions(2));
      expect(readSpy).toHaveBeenCalledTimes(2);
      expect(writeSpy).toHaveBeenCalledTimes(2);

      // 3. Third crawl with maxDepth: 1 again, should be a cache hit.
      await crawl(getOptions(1));
      expect(readSpy).toHaveBeenCalledTimes(3);
      expect(writeSpy).toHaveBeenCalledTimes(2); // No new write
    });
  });

  describe('with maxDepth', () => {
    beforeEach(async () => {
      tmpDir = await createTmpDir({
        'file-root.txt': '',
        level1: {
          'file-level1.txt': '',
          level2: {
            'file-level2.txt': '',
            level3: {
              'file-level3.txt': '',
            },
          },
        },
      });
    });

    const getCrawlResults = (maxDepth?: number) => {
      const ignore = loadIgnoreRules({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
      });
      return crawl({
        crawlDirectory: tmpDir,
        cwd: tmpDir,
        ignore,
        cache: false,
        cacheTtl: 0,
        maxDepth,
      });
    };

    it('should only crawl top-level files when maxDepth is 0', async () => {
      const results = await getCrawlResults(0);
      expect(results).toEqual(
        expect.arrayContaining(['.', 'level1/', 'file-root.txt']),
      );
    });

    it('should crawl one level deep when maxDepth is 1', async () => {
      const results = await getCrawlResults(1);
      expect(results).toEqual(
        expect.arrayContaining([
          '.',
          'level1/',
          'level1/level2/',
          'file-root.txt',
          'level1/file-level1.txt',
        ]),
      );
    });

    it('should crawl two levels deep when maxDepth is 2', async () => {
      const results = await getCrawlResults(2);
      expect(results).toEqual(
        expect.arrayContaining([
          '.',
          'level1/',
          'level1/level2/',
          'level1/level2/level3/',
          'file-root.txt',
          'level1/file-level1.txt',
          'level1/level2/file-level2.txt',
        ]),
      );
    });

    it('should perform a full recursive crawl when maxDepth is undefined', async () => {
      const results = await getCrawlResults(undefined);
      expect(results).toEqual(
        expect.arrayContaining([
          '.',
          'level1/',
          'level1/level2/',
          'level1/level2/level3/',
          'file-root.txt',
          'level1/file-level1.txt',
          'level1/level2/file-level2.txt',
          'level1/level2/level3/file-level3.txt',
        ]),
      );
    });
  });
});
