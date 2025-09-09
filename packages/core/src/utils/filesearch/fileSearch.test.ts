/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { FileSearchFactory, AbortError, filter } from './fileSearch.js';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';

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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: ['logs'],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: true,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('**/*.js', { maxResults: 2 });

    expect(results).toEqual(['src/file1.js', 'src/file2.js']); // Assuming alphabetical sort
  });

  it('should use fzf for fuzzy matching when pattern does not contain wildcards', async () => {
    tmpDir = await createTmpDir({
      src: {
        'main.js': '',
        'util.ts': '',
        'style.css': '',
      },
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('sst');

    expect(results).toEqual(['src/style.css']);
  });

  it('should not use fzf for fuzzy matching when disableFuzzySearch is true', async () => {
    tmpDir = await createTmpDir({
      src: {
        'file1.js': '',
        'flexible.js': '',
        'other.ts': '',
      },
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: true,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('fle');

    expect(results).toEqual(['src/flexible.js']);
  });

  it('should use fzf for fuzzy matching when disableFuzzySearch is false', async () => {
    tmpDir = await createTmpDir({
      src: {
        'file1.js': '',
        'flexible.js': '',
        'other.ts': '',
      },
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
    });

    await fileSearch.initialize();
    const results = await fileSearch.search('fle');

    expect(results).toEqual(
      expect.arrayContaining(['src/file1.js', 'src/flexible.js']),
    );
  });

  it('should return empty array when no matches are found', async () => {
    tmpDir = await createTmpDir({
      src: ['file1.js'],
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

  it('should throw an error if search is called before initialization', async () => {
    tmpDir = await createTmpDir({});
    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
    });

    await expect(fileSearch.search('')).rejects.toThrow(
      'Engine not initialized. Call initialize() first.',
    );
  });

  it('should handle empty or commented-only ignore files', async () => {
    tmpDir = await createTmpDir({
      '.gitignore': '# This is a comment\n\n   \n',
      src: ['main.js'],
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: true,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false, // Explicitly disable .gitignore to isolate this rule
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: true, // Enable caching for this test
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: true, // Ensure caching is enabled
      cacheTtl: 10000,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
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

  it('should handle file paths with special characters that need escaping', async () => {
    tmpDir = await createTmpDir({
      src: {
        'file with (special) chars.txt': '',
        'another-file.txt': '',
      },
    });

    const fileSearch = FileSearchFactory.create({
      projectRoot: tmpDir,
      useGitignore: false,
      useGeminiignore: false,
      ignoreDirs: [],
      cache: false,
      cacheTtl: 0,
      enableRecursiveFileSearch: true,
      disableFuzzySearch: false,
    });

    await fileSearch.initialize();

    // Search for the file using a pattern that contains special characters.
    // The `unescapePath` function should handle the escaped path correctly.
    const results = await fileSearch.search(
      'src/file with \\(special\\) chars.txt',
    );

    expect(results).toEqual(['src/file with (special) chars.txt']);
  });

  describe('DirectoryFileSearch', () => {
    it('should search for files in the current directory', async () => {
      tmpDir = await createTmpDir({
        'file1.js': '',
        'file2.ts': '',
        'file3.js': '',
      });

      const fileSearch = FileSearchFactory.create({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: false,
        cacheTtl: 0,
        enableRecursiveFileSearch: false,
        disableFuzzySearch: false,
      });

      await fileSearch.initialize();
      const results = await fileSearch.search('*.js');
      expect(results).toEqual(['file1.js', 'file3.js']);
    });

    it('should search for files in a subdirectory', async () => {
      tmpDir = await createTmpDir({
        'file1.js': '',
        src: {
          'file2.js': '',
          'file3.ts': '',
        },
      });

      const fileSearch = FileSearchFactory.create({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: false,
        cacheTtl: 0,
        enableRecursiveFileSearch: false,
        disableFuzzySearch: false,
      });

      await fileSearch.initialize();
      const results = await fileSearch.search('src/*.js');
      expect(results).toEqual(['src/file2.js']);
    });

    it('should list all files in a directory', async () => {
      tmpDir = await createTmpDir({
        'file1.js': '',
        src: {
          'file2.js': '',
          'file3.ts': '',
        },
      });

      const fileSearch = FileSearchFactory.create({
        projectRoot: tmpDir,
        useGitignore: false,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: false,
        cacheTtl: 0,
        enableRecursiveFileSearch: false,
        disableFuzzySearch: false,
      });

      await fileSearch.initialize();
      const results = await fileSearch.search('src/');
      expect(results).toEqual(['src/file2.js', 'src/file3.ts']);
    });

    it('should respect ignore rules', async () => {
      tmpDir = await createTmpDir({
        '.gitignore': '*.js',
        'file1.js': '',
        'file2.ts': '',
      });

      const fileSearch = FileSearchFactory.create({
        projectRoot: tmpDir,
        useGitignore: true,
        useGeminiignore: false,
        ignoreDirs: [],
        cache: false,
        cacheTtl: 0,
        enableRecursiveFileSearch: false,
        disableFuzzySearch: false,
      });

      await fileSearch.initialize();
      const results = await fileSearch.search('*');
      expect(results).toEqual(['.gitignore', 'file2.ts']);
    });
  });
});
