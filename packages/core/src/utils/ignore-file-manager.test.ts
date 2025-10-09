/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createIgnoreFileType,
  IgnoreFileManager,
  type IgnoreFileType,
} from './ignore-file-manager.js';
import { vol } from 'memfs';
import path from 'node:path';

// Spy on readFileSync on the vol object from memfs
const readFileSyncSpy = vi.spyOn(vol, 'readFileSync');

vi.mock('fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return {
    default: {
      ...memfs.fs,
      existsSync: (path: string) => memfs.vol.existsSync(path),
      readFileSync: (path: string) => memfs.vol.readFileSync(path),
    },
    ...memfs.fs,
    existsSync: (path: string) => memfs.vol.existsSync(path),
    readFileSync: (path: string) => memfs.vol.readFileSync(path),
  };
});

describe('IgnoreFileManager', () => {
  const projectRoot = '/project';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Scenario 1: File Type Precedence Over Directory Depth', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.geminiignore')]: '**/*.js',
      [path.join(projectRoot, 'src', 'component', '.gitignore')]: '!index.js',
      [path.join(projectRoot, 'src', 'component', 'index.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath = path.join(projectRoot, 'src', 'component', 'index.js');

    expect(manager.isIgnored(filePath)).toBe(true);
  });

  it('Scenario 2: Directory Depth Precedence', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '*.js',
      [path.join(projectRoot, 'src', '.gitignore')]: '!component/*.js',
      [path.join(projectRoot, 'src', 'component', 'index.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath = path.join(projectRoot, 'src', 'component', 'index.js');

    expect(manager.isIgnored(filePath)).toBe(false);
  });

  it('Scenario 3: Global Rules', () => {
    const ignoreFileTypesWithGlobal: IgnoreFileType[] = [
      createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
      createIgnoreFileType({
        name: '.gitignore',
        precedence: 1,
        staticGlobalRules: ['*.log'],
      }),
    ];

    vol.fromJSON({
      [path.join(projectRoot, 'src', 'temp.log')]: 'content',
    });

    const manager = new IgnoreFileManager(
      projectRoot,
      ignoreFileTypesWithGlobal,
    );
    const filePath = path.join(projectRoot, 'src', 'temp.log');

    expect(manager.isIgnored(filePath)).toBe(true);
  });

  it('should respect global rules from globalRuleFilePaths', () => {
    const globalIgnoreFile = '.git/info/exclude';
    const ignoreFileTypesWithGlobal: IgnoreFileType[] = [
      createIgnoreFileType({
        name: '.gitignore',
        precedence: 1,
        globalRuleFilePaths: [globalIgnoreFile],
      }),
    ];

    vol.fromJSON({
      [path.join(projectRoot, globalIgnoreFile)]: '*.secret',
      [path.join(projectRoot, 'src', 'my.secret')]: 'content',
    });

    const manager = new IgnoreFileManager(
      projectRoot,
      ignoreFileTypesWithGlobal,
    );
    const filePath = path.join(projectRoot, 'src', 'my.secret');

    expect(manager.isIgnored(filePath)).toBe(true);
  });

  it('should not ignore a file if no rules match', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '*.ts',
      [path.join(projectRoot, 'src', 'index.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath = path.join(projectRoot, 'src', 'index.js');

    expect(manager.isIgnored(filePath)).toBe(false);
  });

  it('should handle unignore patterns correctly', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '**/*.js\n!/src/index.js',
      [path.join(projectRoot, 'src', 'index.js')]: 'content',
      [path.join(projectRoot, 'src', 'other.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath1 = path.join(projectRoot, 'src', 'index.js');
    const filePath2 = path.join(projectRoot, 'src', 'other.js');

    expect(manager.isIgnored(filePath1)).toBe(false);
    expect(manager.isIgnored(filePath2)).toBe(true);
  });

  it('sub-directory is found if negated in geminiignore', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '**/*.ts\n/src/',
      [path.join(projectRoot, '.geminiignore')]: '!/src/',
      [path.join(projectRoot, 'foo', 'bar.js')]: 'content',
      [path.join(projectRoot, 'src', 'index.ts')]: 'content',
      [path.join(projectRoot, 'src', 'other.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath1 = path.join(projectRoot, 'src', 'index.ts');
    const filePath2 = path.join(projectRoot, 'src', 'other.js');
    const filePath3 = path.join(projectRoot, 'foo', 'bar.js');

    // ts file under src should still be ignored
    expect(manager.isIgnored(filePath1)).toBe(true);
    // js file under src should be found
    expect(manager.isIgnored(filePath2)).toBe(false);
    // js file under foo should be found
    expect(manager.isIgnored(filePath3)).toBe(false);
  });
});

describe('Complex Multi-Level Ignore Scenarios', () => {
  const projectRoot = '/project';
  const threeTierIgnoreFiles: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.thirdignore', precedence: 3 }),
    createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vol.reset();
  });

  it('should respect highest precedence file type even when nested lower', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.thirdignore')]: '**/*.js',
      [path.join(projectRoot, 'src', 'app', '.geminiignore')]: '!app.js',
      [path.join(projectRoot, 'src', 'app', 'components', '.gitignore')]:
        'app.js',
      [path.join(projectRoot, 'src', 'app', 'app.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, threeTierIgnoreFiles);
    const filePath = path.join(projectRoot, 'src', 'app', 'app.js');

    // Rules added to the engine, in order of processing:
    // 1. from /project/src/app/components/.gitignore: `src/app/components/app.js`
    // 2. from /project/src/app/.geminiignore: `!src/app/app.js`
    // 3. from /project/.thirdignore: `**/*.js`
    // For the path `src/app/app.js`, the last matching pattern is `**/*.js`, so it should be IGNORED.
    expect(manager.isIgnored(filePath)).toBe(true);
  });

  it('should handle a chain of ignore, unignore, and re-ignore across types and depths', () => {
    vol.fromJSON({
      // Lowest precedence, ignores all logs
      [path.join(projectRoot, '.gitignore')]: '*.log',
      // Medium precedence, un-ignores a specific log
      [path.join(projectRoot, 'src', 'feature', '.geminiignore')]: '!debug.log',
      // Highest precedence, re-ignores that specific log
      [path.join(projectRoot, 'src', 'feature', 'utils', '.thirdignore')]:
        'debug.log',
      [path.join(projectRoot, 'src', 'feature', 'utils', 'debug.log')]:
        'log content',
    });

    const manager = new IgnoreFileManager(projectRoot, threeTierIgnoreFiles);
    const filePath = path.join(
      projectRoot,
      'src',
      'feature',
      'utils',
      'debug.log',
    );

    // Order of rules added:
    // 1. from /project/.gitignore: `*.log`
    // 2. from /project/src/feature/.geminiignore: `!src/feature/debug.log`
    // 3. from /project/src/feature/utils/.thirdignore: `src/feature/utils/debug.log`
    // The last matching rule for `src/feature/utils/debug.log` is the re-ignore.
    expect(manager.isIgnored(filePath)).toBe(true);
  });

  it('should correctly handle directory ignores being negated by file un-ignores', () => {
    vol.fromJSON({
      // Ignores the entire build directory
      [path.join(projectRoot, '.gitignore')]: '/build/',
      // Un-ignores a specific asset inside build
      [path.join(projectRoot, 'build', '.geminiignore')]: '!important.asset',
      // But a higher-precedence file re-ignores all assets
      [path.join(projectRoot, '.thirdignore')]: '*.asset',
      [path.join(projectRoot, 'build', 'output.txt')]: 'content',
      [path.join(projectRoot, 'build', 'important.asset')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, threeTierIgnoreFiles);
    const txtPath = path.join(projectRoot, 'build', 'output.txt');
    const assetPath = path.join(projectRoot, 'build', 'important.asset');

    // output.txt is ignored by the initial /build/ rule.
    expect(manager.isIgnored(txtPath)).toBe(true);
    // important.asset is un-ignored by .geminiignore, but re-ignored by .thirdignore.
    expect(manager.isIgnored(assetPath)).toBe(true);
  });

  it('should correctly resolve conflicts between global, root, and nested ignore files with precedence', () => {
    const globalGitIgnoreFile = '.gitingore_global';
    const complexIgnoreFileTypes: IgnoreFileType[] = [
      createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
      createIgnoreFileType({
        name: '.gitignore',
        precedence: 1,
        globalRuleFilePaths: [globalGitIgnoreFile],
      }),
    ];

    vol.fromJSON({
      // Global git rule (lowest precedence) ignores all logs.
      [path.join(projectRoot, globalGitIgnoreFile)]: '*.log',
      // Root .gitignore (low precedence) un-ignores a specific log.
      [path.join(projectRoot, '.gitignore')]: '!/src/important.log',
      // Nested .geminiignore (high precedence) re-ignores that same log.
      [path.join(projectRoot, 'src', '.geminiignore')]: 'important.log',
      [path.join(projectRoot, 'src', 'important.log')]: 'log content',
      [path.join(projectRoot, 'another.log')]: 'log content',
    });

    const manager = new IgnoreFileManager(projectRoot, complexIgnoreFileTypes);
    const importantLogPath = path.join(projectRoot, 'src', 'important.log');
    const anotherLogPath = path.join(projectRoot, 'another.log');

    // another.log is ignored by the global rule and never un-ignored.
    expect(manager.isIgnored(anotherLogPath)).toBe(true);
    // important.log is ignored globally, un-ignored by .gitignore, but re-ignored
    // by the higher-precedence .geminiignore. The final result is that it should be ignored.
    expect(manager.isIgnored(importantLogPath)).toBe(true);
  });
});

describe('IgnoreFileManager Caching', () => {
  const projectRoot = '/project';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vol.reset();
  });

  //afterEach(() => {
  //  vi.clearAllMocks();
  //});

  it('should cache the rules engine for a directory', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: 'root.js',
      [path.join(projectRoot, 'src', '.gitignore')]: 'a.js',
      [path.join(projectRoot, 'src', 'a.js')]: 'content',
      [path.join(projectRoot, 'src', 'b.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath1 = path.join(projectRoot, 'src', 'a.js');
    const filePath2 = path.join(projectRoot, 'src', 'b.js');

    // First call for this directory.
    // Reads /project/.gitignore, /project/.geminiignore (miss)
    // Reads /project/src/.gitignore, /project/src/.geminiignore (miss)
    expect(manager.isIgnored(filePath1)).toBe(true);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);

    // Second call for the same directory, should use the final engine cache.
    expect(manager.isIgnored(filePath2)).toBe(false);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2); // No new calls
  });

  it('should reuse parent partial caches for sibling directories', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: 'root.js',
      [path.join(projectRoot, 'src', 'a', '.gitignore')]: 'a.js',
      [path.join(projectRoot, 'src', 'b', '.gitignore')]: 'b.js',
      [path.join(projectRoot, 'src', 'a', 'a.js')]: 'content',
      [path.join(projectRoot, 'src', 'b', 'b.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath1 = path.join(projectRoot, 'src', 'a', 'a.js');
    const filePath2 = path.join(projectRoot, 'src', 'b', 'b.js');

    // First call for /src/a.
    // Reads .gitignore for /, /src, /src/a (3 reads) -> Corrected: Reads for /, /src/a (2 reads)
    // Reads .geminiignore for /, /src, /src/a (0 reads)
    expect(manager.isIgnored(filePath1)).toBe(true);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);

    // Second call for sibling /src/b.
    // Reuses partial caches for .gitignore at / and /src.
    // Only needs to read .gitignore in /src/b.
    // Reuses partial caches for .geminiignore at /, /src.
    // Only needs to check for .geminiignore in /src/b.
    expect(manager.isIgnored(filePath2)).toBe(true);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(3); // Only one new call
  });

  it('should reuse partial caches across multiple file types', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: 'root.js',
      [path.join(projectRoot, '.geminiignore')]: 'root.gemini.js',
      [path.join(projectRoot, 'src', 'a', '.gitignore')]: 'a.js',
      [path.join(projectRoot, 'src', 'b', '.geminiignore')]: 'b.gemini.js',
      [path.join(projectRoot, 'src', 'a', 'a.js')]: 'content',
      [path.join(projectRoot, 'src', 'b', 'b.gemini.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath1 = path.join(projectRoot, 'src', 'a', 'a.js');
    const filePath2 = path.join(projectRoot, 'src', 'b', 'b.gemini.js');

    // Reads .gitignore for /, /src/a (2 reads)
    // Reads .geminiignore for / (1 read)
    expect(manager.isIgnored(filePath1)).toBe(true);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(3);

    // Second call for /src/b.
    // Reuses .gitignore partials for /, /src. Checks /src/b (miss).
    // Reuses .geminiignore partials for /, /src. Checks /src/b (hit).
    expect(manager.isIgnored(filePath2)).toBe(true);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(4); // Only one new call
  });

  it('should reuse parent instance directly when no ignore file exists in subdirectory (optimization)', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '*.log',
      [path.join(projectRoot, '.geminiignore')]: '*.tmp',
      [path.join(projectRoot, 'src', 'a', 'app.log')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath = path.join(projectRoot, 'src', 'a', 'app.log');

    // 1. Get partial for root (pre-computed in constructor)
    // 2. Get partial for /src (no .gitignore, reuses root instance)
    // 3. Get partial for /src/a (no .gitignore, reuses /src instance which is root instance)

    expect(manager.isIgnored(filePath)).toBe(true);

    // readFileSync is called in constructor for root .gitignore and .geminiignore
    // It should NOT be called for /src/.gitignore or /src/a/.gitignore
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);
  });
});
describe('IgnoreFileManager outside project root', () => {
  const projectRoot = '/project';
  const outsideDir = '/outside';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vol.reset();
  });

  it('should not be affected by ignore files outside the project root', () => {
    vol.fromJSON({
      [path.join(outsideDir, '.gitignore')]: 'internal.js',
      [path.join(projectRoot, 'internal.js')]: 'content',
      [path.join(projectRoot, '.gitignore')]: 'external.js',
      [path.join(projectRoot, 'external.js')]: 'content',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const internalFile = path.join(projectRoot, 'internal.js');
    const externalFile = path.join(projectRoot, 'external.js');

    expect(manager.isIgnored(internalFile)).toBe(false);
    expect(manager.isIgnored(externalFile)).toBe(true);
  });
});

describe('isIgnoredBy', () => {
  const projectRoot = '/project';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.geminiignore', precedence: 2 }),
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vol.reset();
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: 'git-only.js\nboth.js',
      [path.join(projectRoot, '.geminiignore')]: 'gemini-only.js\nboth.js',
      [path.join(projectRoot, 'git-only.js')]: 'content',
      [path.join(projectRoot, 'gemini-only.js')]: 'content',
      [path.join(projectRoot, 'both.js')]: 'content',
      [path.join(projectRoot, 'neither.js')]: 'content',
    });
  });

  it('should correctly identify which file type ignores a path', () => {
    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);

    const gitOnlyPath = path.join(projectRoot, 'git-only.js');
    const geminiOnlyPath = path.join(projectRoot, 'gemini-only.js');
    const bothPath = path.join(projectRoot, 'both.js');
    const neitherPath = path.join(projectRoot, 'neither.js');

    expect(manager.isIgnoredBy(gitOnlyPath, '.gitignore')).toBe(true);
    expect(manager.isIgnoredBy(gitOnlyPath, '.geminiignore')).toBe(false);

    expect(manager.isIgnoredBy(geminiOnlyPath, '.gitignore')).toBe(false);
    expect(manager.isIgnoredBy(geminiOnlyPath, '.geminiignore')).toBe(true);

    expect(manager.isIgnoredBy(bothPath, '.gitignore')).toBe(true);
    expect(manager.isIgnoredBy(bothPath, '.geminiignore')).toBe(true);

    expect(manager.isIgnoredBy(neitherPath, '.gitignore')).toBe(false);
    expect(manager.isIgnoredBy(neitherPath, '.geminiignore')).toBe(false);
  });

  it('should return false for an unknown file type', () => {
    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const filePath = path.join(projectRoot, 'git-only.js');
    expect(manager.isIgnoredBy(filePath, '.unknownignore')).toBe(false);
  });
});

describe('IgnoreFileManager Path Validation', () => {
  const projectRoot = '/project';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.gitignore', precedence: 1 }),
  ];
  let manager: IgnoreFileManager;

  beforeEach(() => {
    vol.reset();
    vol.fromJSON({
      [path.join(projectRoot, '.gitignore')]: '*.log',
    });
    manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
  });

  it('should return false for empty path', () => {
    expect(manager.isIgnored('')).toBe(false);
    expect(manager.isIgnoredBy('', '.gitignore')).toBe(false);
  });

  it('should return false for non-string path (simulated)', () => {
    // TypeScript prevents passing non-string, but we test runtime behavior
    // @ts-expect-error testing runtime behavior
    expect(manager.isIgnored(null)).toBe(false);
    // @ts-expect-error testing runtime behavior
    expect(manager.isIgnoredBy(null, '.gitignore')).toBe(false);
  });

  it('should return false for path outside project root', () => {
    const outsidePath = '/outside.txt';
    expect(manager.isIgnored(outsidePath)).toBe(false);
    expect(manager.isIgnoredBy(outsidePath, '.gitignore')).toBe(false);
  });

  it('should return false for project root path', () => {
    expect(manager.isIgnored(projectRoot)).toBe(false);
    expect(manager.isIgnoredBy(projectRoot, '.gitignore')).toBe(false);
  });

  it('should return false for project root path with trailing slash', () => {
    expect(manager.isIgnored(projectRoot + path.sep)).toBe(false);
    expect(manager.isIgnoredBy(projectRoot + path.sep, '.gitignore')).toBe(
      false,
    );
  });

  it('should return false for path with project root as prefix', () => {
    const prefixPath = projectRoot + '-qux/blah';
    expect(manager.isIgnored(prefixPath)).toBe(false);
    expect(manager.isIgnoredBy(prefixPath, '.gitignore')).toBe(false);
  });
});

describe('getRootPatterns', () => {
  const projectRoot = '/project';
  const ignoreFileTypes: IgnoreFileType[] = [
    createIgnoreFileType({ name: '.geminiignore', precedence: 1 }),
  ];

  beforeEach(() => {
    vol.reset();
  });

  it('should retrieve patterns from a root ignore file', () => {
    const content = 'node_modules\n*.log\nbuild/';
    vol.fromJSON({
      [path.join(projectRoot, '.geminiignore')]: content,
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const patterns = manager.getRootPatterns('.geminiignore');

    expect(patterns).toEqual(['node_modules', '*.log', 'build/']);
  });

  it('should filter out comments and empty lines', () => {
    const content = `
# This is a comment
node_modules

*.log
# Another comment
build/
`;
    vol.fromJSON({
      [path.join(projectRoot, '.geminiignore')]: content,
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const patterns = manager.getRootPatterns('.geminiignore');

    expect(patterns).toEqual(['node_modules', '*.log', 'build/']);
  });

  it('should trim whitespace from patterns', () => {
    const content = '  node_modules  \n\t*.log\t\n  build/  ';
    vol.fromJSON({
      [path.join(projectRoot, '.geminiignore')]: content,
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const patterns = manager.getRootPatterns('.geminiignore');

    expect(patterns).toEqual(['node_modules', '*.log', 'build/']);
  });

  it('should return an empty array if the ignore file does not exist', () => {
    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const patterns = manager.getRootPatterns('.geminiignore');

    expect(patterns).toEqual([]);
  });

  it('should return an empty array for a non-existent file type', () => {
    vol.fromJSON({
      [path.join(projectRoot, '.geminiignore')]: '*.log',
    });

    const manager = new IgnoreFileManager(projectRoot, ignoreFileTypes);
    const patterns = manager.getRootPatterns('.gitignore');

    expect(patterns).toEqual([]);
  });
});
