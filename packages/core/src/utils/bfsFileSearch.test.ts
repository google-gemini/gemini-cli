/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { bfsFileSearch } from './bfsFileSearch.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

describe('bfsFileSearch', () => {
  let testRootDir: string;

  async function createEmptyDir(...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fsPromises.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async function createTestFile(content: string, ...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, content);
    return fullPath;
  }

  beforeEach(async () => {
    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'bfs-file-search-test-'),
    );
  });

  afterEach(async () => {
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
  });

  it('should find a file in the root directory', async () => {
    const targetFilePath = await createTestFile('content', 'target.txt');
    const result = await bfsFileSearch(testRootDir, { fileName: 'target.txt' });
    expect(result).toEqual([targetFilePath]);
  });

  it('should find a file in a nested directory', async () => {
    const targetFilePath = await createTestFile(
      'content',
      'a',
      'b',
      'target.txt',
    );
    const result = await bfsFileSearch(testRootDir, { fileName: 'target.txt' });
    expect(result).toEqual([targetFilePath]);
  });

  it('should find multiple files with the same name', async () => {
    const targetFilePath1 = await createTestFile('content1', 'a', 'target.txt');
    const targetFilePath2 = await createTestFile('content2', 'b', 'target.txt');
    const result = await bfsFileSearch(testRootDir, { fileName: 'target.txt' });
    result.sort();
    expect(result).toEqual([targetFilePath1, targetFilePath2].sort());
  });

  it('should return an empty array if no file is found', async () => {
    await createTestFile('content', 'other.txt');
    const result = await bfsFileSearch(testRootDir, { fileName: 'target.txt' });
    expect(result).toEqual([]);
  });

  it('should ignore directories specified in ignoreDirs', async () => {
    await createTestFile('content', 'ignored', 'target.txt');
    const targetFilePath = await createTestFile(
      'content',
      'not-ignored',
      'target.txt',
    );
    const result = await bfsFileSearch(testRootDir, {
      fileName: 'target.txt',
      ignoreDirs: ['ignored'],
    });
    expect(result).toEqual([targetFilePath]);
  });

  it('should respect the maxDirs limit and not find the file', async () => {
    await createTestFile('content', 'a', 'b', 'c', 'target.txt');
    const result = await bfsFileSearch(testRootDir, {
      fileName: 'target.txt',
      maxDirs: 3,
    });
    expect(result).toEqual([]);
  });

  it('should respect the maxDirs limit and find the file', async () => {
    const targetFilePath = await createTestFile(
      'content',
      'a',
      'b',
      'c',
      'target.txt',
    );
    const result = await bfsFileSearch(testRootDir, {
      fileName: 'target.txt',
      maxDirs: 4,
    });
    expect(result).toEqual([targetFilePath]);
  });

  describe('with FileDiscoveryService', () => {
    let projectRoot: string;

    beforeEach(async () => {
      projectRoot = await createEmptyDir('project');
    });

    it('should ignore gitignored files', async () => {
      await createEmptyDir('project', '.git');
      await createTestFile('node_modules/', 'project', '.gitignore');
      await createTestFile('content', 'project', 'node_modules', 'target.txt');
      const targetFilePath = await createTestFile(
        'content',
        'project',
        'not-ignored',
        'target.txt',
      );

      const fileService = new FileDiscoveryService(projectRoot);
      const result = await bfsFileSearch(projectRoot, {
        fileName: 'target.txt',
        fileService,
        fileFilteringOptions: {
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        },
      });

      expect(result).toEqual([targetFilePath]);
    });

    it('should ignore geminiignored files', async () => {
      await createTestFile('node_modules/', 'project', '.geminiignore');
      await createTestFile('content', 'project', 'node_modules', 'target.txt');
      const targetFilePath = await createTestFile(
        'content',
        'project',
        'not-ignored',
        'target.txt',
      );

      const fileService = new FileDiscoveryService(projectRoot);
      const result = await bfsFileSearch(projectRoot, {
        fileName: 'target.txt',
        fileService,
        fileFilteringOptions: {
          respectGitIgnore: false,
          respectGeminiIgnore: true,
        },
      });

      expect(result).toEqual([targetFilePath]);
    });

    it('should not ignore files if respect flags are false', async () => {
      await createEmptyDir('project', '.git');
      await createTestFile('node_modules/', 'project', '.gitignore');
      const target1 = await createTestFile(
        'content',
        'project',
        'node_modules',
        'target.txt',
      );
      const target2 = await createTestFile(
        'content',
        'project',
        'not-ignored',
        'target.txt',
      );

      const fileService = new FileDiscoveryService(projectRoot);
      const result = await bfsFileSearch(projectRoot, {
        fileName: 'target.txt',
        fileService,
        fileFilteringOptions: {
          respectGitIgnore: false,
          respectGeminiIgnore: false,
        },
      });

      expect(result.sort()).toEqual([target1, target2].sort());
    });
  });
});
