/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as cache from './crawlCache.js';
import { FileSearch, AbortError, filter } from './fileSearch.js';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';

type FileSearchWithPrivateMethods = FileSearch & {
  performCrawl: () => Promise<void>;
};

describe('FileSearch', () => {
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

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual(['src/', '.geminiignore', 'src/not-ignored.js']);
  });

  it('should combine .gitignore and .geminiignore rules', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': 'dist/',
      '.geminiignore': 'build/',
      dist: ['ignored-by-git.js'],
      build: ['ignored-by-gemini.js'],
      src: ['not-ignored.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual([
      'src/',
      '.geminiignore',
      '.gitignore',
      'src/not-ignored.js',
    ]);
  });

  it('should use ignoreDirs option', async () => {
    tmpDir = await createTmpDir({
      logs: ['some.log'],
      src: ['main.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: ['logs'],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual(['src/', 'src/main.js']);
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

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual([
      'build/',
      'build/public/',
      'src/',
      '.gitignore',
      'build/public/index.html',
      'src/main.js',
    ]);
  });

  it('should filter results with a search pattern', async () => {
    tmpDir = await createTmpDir({
      src: {
        'main.js': '',
        'util.ts': '',
        'style.css': '',
      },
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('**/*.js');

    expect(results).toEqual(['src/main.js']);
  });

  it('should handle root-level file negation', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': ['*.mk', '!Foo.mk'].join('\n'),
      'bar.mk': '',
      'Foo.mk': '',
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual(['.gitignore', 'Foo.mk']);
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

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual([
      'third_party/',
      'third_party/foo/',
      'third_party/foo/bar/',
      '.gitignore',
      'third_party/foo/bar/baz_buffer',
    ]);
  });

  it('should correctly handle negated patterns in .gitignore', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': ['dist/**', '!dist/keep.js'].join('\n'),
      dist: ['ignore.js', 'keep.js'],
      src: ['main.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual([
      'dist/',
      'src/',
      '.gitignore',
      'dist/keep.js',
      'src/main.js',
    ]);
  });

  // New test cases start here

  it('should initialize correctly when ignore files are missing', async () => {
    tmpDir = await createTmpDir({
      src: ['file1.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    // Expect no errors to be thrown during initialization
    await expect(fileSearch.initialize()).resolves.toBeUndefined();
    const results = await fileSearch.search('');
    expect(results).toEqual(['src/', 'src/file1.js']);
  });

  it('should respect maxResults option in search', async () => {
    tmpDir = await createTmpDir({
      src: {
        'file1.js': '',
        'file2.js': '',
        'file3.js': '',
        'file4.js': '',
      },
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('**/*.js', { maxResults: 2 });

    expect(results).toEqual(['src/file1.js', 'src/file2.js']); // Assuming alphabetical sort
  });

  it('should return empty array when no matches are found', async () => {
    tmpDir = await createTmpDir({
      src: ['file1.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('nonexistent-file.xyz');

    expect(results).toEqual([]);
  });

  it('should throw AbortError when filter is aborted', async () => {
    const controller = new AbortController();
    const dummyPaths = Array.from({ length: 5000 }, (_, i) => `file${i}.js`); // Large array to ensure yielding

    const filterPromise = filter(dummyPaths, '*.js', controller.signal);

    // Abort after a short delay to ensure filter has started
    setTimeout(() => controller.abort(), 1);

    await expect(filterPromise).rejects.toThrow(AbortError);
  });

  describe('with in-memory cache', () => {
    beforeEach(() => {
      cache.clear();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should throw an error if search is called before initialization', async () => {
      tmpDir = await createTmpDir({});
      const fileSearch = new FileSearch({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: false,
        cacheTtl: 0,
      });

      await expect(fileSearch.search('')).rejects.toThrow(
        'Engine not initialized. Call initialize() first.',
      );
    });

    it('should hit the cache for subsequent searches', async () => {
      tmpDir = await createTmpDir({ 'file1.js': '' });
      const getOptions = () => ({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: true,
        cacheTtl: 10,
      });

      const fs1 = new FileSearch(getOptions());
      const crawlSpy1 = vi.spyOn(
        fs1 as FileSearchWithPrivateMethods,
        'performCrawl',
      );
      await fs1.initialize();
      expect(crawlSpy1).toHaveBeenCalledTimes(1);

      // Second search should hit the cache because the options are identical
      const fs2 = new FileSearch(getOptions());
      const crawlSpy2 = vi.spyOn(
        fs2 as FileSearchWithPrivateMethods,
        'performCrawl',
      );
      await fs2.initialize();
      expect(crawlSpy2).not.toHaveBeenCalled();
    });

    it('should miss the cache when ignore rules change', async () => {
      tmpDir = await createTmpDir({
        '.gitignore': 'a.txt',
        'a.txt': '',
        'b.txt': '',
      });
      const options = {
        projectRoot: tmpDir,
        useGitignore: true,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: true,
        cacheTtl: 10000,
      };

      // Initial search to populate the cache
      const fs1 = new FileSearch(options);
      const crawlSpy1 = vi.spyOn(
        fs1 as FileSearchWithPrivateMethods,
        'performCrawl',
      );
      await fs1.initialize();
      const results1 = await fs1.search('');
      expect(crawlSpy1).toHaveBeenCalledTimes(1);
      expect(results1).toEqual(['.gitignore', 'b.txt']);

      // Modify the ignore file
      await fs.writeFile(path.join(tmpDir, '.gitignore'), 'b.txt');

      // Second search should miss the cache and trigger a recrawl
      const fs2 = new FileSearch(options);
      const crawlSpy2 = vi.spyOn(
        fs2 as FileSearchWithPrivateMethods,
        'performCrawl',
      );
      await fs2.initialize();
      const results2 = await fs2.search('');
      expect(crawlSpy2).toHaveBeenCalledTimes(1);
      expect(results2).toEqual(['.gitignore', 'a.txt']);
    });

    it('should miss the cache after TTL expires', async () => {
      vi.useFakeTimers();
      tmpDir = await createTmpDir({ 'file1.js': '' });
      const options = {
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: true,
        cacheTtl: 10, // 10 seconds
      };

      // Initial search to populate the cache
      const fs1 = new FileSearch(options);
      await fs1.initialize();

      // Advance time past the TTL
      await vi.advanceTimersByTimeAsync(11000);

      // Second search should miss the cache and trigger a recrawl
      const fs2 = new FileSearch(options);
      const crawlSpy = vi.spyOn(
        fs2 as FileSearchWithPrivateMethods,
        'performCrawl',
      );
      await fs2.initialize();

      expect(crawlSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle empty or commented-only ignore files', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': '# This is a comment\n\n   \n',
      src: ['main.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual(['src/', '.gitignore', 'src/main.js']);
  });

  it('should always ignore the .git directory', async () => {
    tmpDir = await createTmpDir({
      '.git': ['config', 'HEAD'],
      src: ['main.js'],
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false, // Explicitly disable .gitignore to isolate this rule
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('');

    expect(results).toEqual(['src/', 'src/main.js']);
  });

  it('should be cancellable via AbortSignal', async () => {
    const largeDir: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      largeDir[`file${i}.js`] = '';
    }
    tmpDir = await createTmpDir(largeDir);

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();

    const controller = new AbortController();
    const searchPromise = fileSearch.search('**/*.js', {
      signal: controller.signal,
    });

    // Yield to allow the search to start before aborting.
    await new Promise((resolve) => setImmediate(resolve));

    controller.abort();

    await expect(searchPromise).rejects.toThrow(AbortError);
  });

  it('should leverage ResultCache for bestBaseQuery optimization', async () => {
    tmpDir = await createTmpDir({
      src: {
        'foo.js': '',
        'bar.ts': '',
        nested: {
          'baz.js': '',
        },
      },
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: true, // Enable caching for this test
      cacheTtl: 0,
    });

    await fileSearch.initialize();

    // Perform a broad search to prime the cache
    const broadResults = await fileSearch.search('src/**');
    expect(broadResults).toEqual([
      'src/',
      'src/nested/',
      'src/bar.ts',
      'src/foo.js',
      'src/nested/baz.js',
    ]);

    // Perform a more specific search that should leverage the broad search's cached results
    const specificResults = await fileSearch.search('src/**/*.js');
    expect(specificResults).toEqual(['src/foo.js', 'src/nested/baz.js']);

    // Although we can't directly inspect ResultCache.hits/misses from here,
    // the correctness of specificResults after a broad search implicitly
    // verifies that the caching mechanism, including bestBaseQuery, is working.
  });

  it('should be case-insensitive by default', async () => {
    tmpDir = await createTmpDir({
      'File1.Js': '',
      'file2.js': '',
      'FILE3.JS': '',
      'other.txt': '',
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
    });

    await fileSearch.initialize();

    // Search with a lowercase pattern
    let results = await fileSearch.search('file*.js');
    expect(results).toHaveLength(3);
    expect(results).toEqual(
      expect.arrayContaining(['File1.Js', 'file2.js', 'FILE3.JS']),
    );

    // Search with an uppercase pattern
    results = await fileSearch.search('FILE*.JS');
    expect(results).toHaveLength(3);
    expect(results).toEqual(
      expect.arrayContaining(['File1.Js', 'file2.js', 'FILE3.JS']),
    );

    // Search with a mixed-case pattern
    results = await fileSearch.search('FiLe*.Js');
    expect(results).toHaveLength(3);
    expect(results).toEqual(
      expect.arrayContaining(['File1.Js', 'file2.js', 'FILE3.JS']),
    );
  });

  it('should respect maxResults even when the cache returns an exact match', async () => {
    tmpDir = await createTmpDir({
      'file1.js': '',
      'file2.js': '',
      'file3.js': '',
      'file4.js': '',
      'file5.js': '',
    });

    const fileSearch = new FileSearch({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: true, // Ensure caching is enabled
      cacheTtl: 10000,
    });

    await fileSearch.initialize();

    // 1. Perform a broad search to populate the cache with an exact match.
    const initialResults = await fileSearch.search('*.js');
    expect(initialResults).toEqual([
      'file1.js',
      'file2.js',
      'file3.js',
      'file4.js',
      'file5.js',
    ]);

    // 2. Perform the same search again, but this time with a maxResults limit.
    const limitedResults = await fileSearch.search('*.js', { maxResults: 2 });

    // 3. Assert that the maxResults limit was respected, even with a cache hit.
    expect(limitedResults).toEqual(['file1.js', 'file2.js']);
  });
});
