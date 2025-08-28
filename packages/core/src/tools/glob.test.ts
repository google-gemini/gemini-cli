/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GlobToolParams, GlobPath } from './glob.js';
import { GlobTool, sortFileEntries } from './glob.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import type { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { ToolErrorType } from './tool-error.js';
import * as glob from 'glob';

vi.mock('glob', { spy: true });

describe('GlobTool', () => {
  let tempRootDir: string; // This will be the rootDirectory for the GlobTool instance
  let globTool: GlobTool;
  const abortSignal = new AbortController().signal;

  // Mock config for testing
  const mockConfig = {
    getFileService: () => new FileDiscoveryService(tempRootDir),
    getFileFilteringRespectGitIgnore: () => true,
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    getFileExclusions: () => ({
      getGlobExcludes: () => [],
    }),
  } as unknown as Config;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-tool-root-'));
    globTool = new GlobTool(mockConfig);

    // Create some test files and directories within this root
    // Top-level files
    await fs.writeFile(path.join(tempRootDir, 'fileA.txt'), 'contentA');
    await fs.writeFile(path.join(tempRootDir, 'FileB.TXT'), 'contentB'); // Different case for testing

    // Subdirectory and files within it
    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(path.join(tempRootDir, 'sub', 'fileC.md'), 'contentC');
    await fs.writeFile(path.join(tempRootDir, 'sub', 'FileD.MD'), 'contentD'); // Different case

    // Deeper subdirectory
    await fs.mkdir(path.join(tempRootDir, 'sub', 'deep'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      'contentE',
    );

    // Files for mtime sorting test
    await fs.writeFile(path.join(tempRootDir, 'older.sortme'), 'older_content');
    // Ensure a noticeable difference in modification time
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.writeFile(path.join(tempRootDir, 'newer.sortme'), 'newer_content');
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should find files matching a simple pattern in the root', async () => {
      const params: GlobToolParams = { pattern: '*.txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
      expect(result.returnDisplay).toBe('Found 2 matching file(s)');
    });

    it('should find files case-sensitively when case_sensitive is true', async () => {
      const params: GlobToolParams = { pattern: '*.txt', case_sensitive: true };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).not.toContain(
        path.join(tempRootDir, 'FileB.TXT'),
      );
    });

    it('should find files case-insensitively by default (pattern: *.TXT)', async () => {
      const params: GlobToolParams = { pattern: '*.TXT' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files case-insensitively when case_sensitive is false (pattern: *.TXT)', async () => {
      const params: GlobToolParams = {
        pattern: '*.TXT',
        case_sensitive: false,
      };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files using a pattern that includes a subdirectory', async () => {
      const params: GlobToolParams = { pattern: 'sub/*.md' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files in a specified relative path (relative to rootDir)', async () => {
      const params: GlobToolParams = { pattern: '*.md', path: 'sub' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files using a deep globstar pattern (e.g., **/*.log)', async () => {
      const params: GlobToolParams = { pattern: '**/*.log' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      );
    });

    it('should return "No files found" message when pattern matches nothing', async () => {
      const params: GlobToolParams = { pattern: '*.nonexistent' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'No files found matching pattern "*.nonexistent"',
      );
      expect(result.returnDisplay).toBe('No files found');
    });

    it('should find files with special characters in the name', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file[1].txt'), 'content');
      const params: GlobToolParams = { pattern: 'file[1].txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'file[1].txt'),
      );
    });

    it('should find files with special characters like [] and () in the path', async () => {
      const filePath = path.join(
        tempRootDir,
        'src/app/[test]/(dashboard)/testing/components/code.tsx',
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'content');

      const params: GlobToolParams = {
        pattern: 'src/app/[test]/(dashboard)/testing/components/code.tsx',
      };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(filePath);
    });

    it('should correctly sort files by modification time (newest first)', async () => {
      const params: GlobToolParams = { pattern: '*.sortme' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      const llmContent = partListUnionToString(result.llmContent);

      expect(llmContent).toContain('Found 2 file(s)');
      // Ensure llmContent is a string for TypeScript type checking
      expect(typeof llmContent).toBe('string');

      const filesListed = llmContent
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean);

      expect(filesListed).toHaveLength(2);
      expect(path.resolve(filesListed[0])).toBe(
        path.resolve(tempRootDir, 'newer.sortme'),
      );
      expect(path.resolve(filesListed[1])).toBe(
        path.resolve(tempRootDir, 'older.sortme'),
      );
    });

    it('should return a PATH_NOT_IN_WORKSPACE error if path is outside workspace', async () => {
      // Bypassing validation to test execute method directly
      vi.spyOn(globTool, 'validateToolParams').mockReturnValue(null);
      const params: GlobToolParams = { pattern: '*.txt', path: '/etc' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.error?.type).toBe(ToolErrorType.PATH_NOT_IN_WORKSPACE);
      expect(result.returnDisplay).toBe('Path is not within workspace');
    });

    it('should return a GLOB_EXECUTION_ERROR on glob failure', async () => {
      vi.mocked(glob.glob).mockRejectedValue(new Error('Glob failed'));
      const params: GlobToolParams = { pattern: '*.txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.error?.type).toBe(ToolErrorType.GLOB_EXECUTION_ERROR);
      expect(result.llmContent).toContain(
        'Error during glob search operation: Glob failed',
      );
      // Reset glob.
      vi.mocked(glob.glob).mockReset();
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters (pattern only)', () => {
      const params: GlobToolParams = { pattern: '*.js' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern and path)', () => {
      const params: GlobToolParams = { pattern: '*.js', path: 'sub' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern, path, and case_sensitive)', () => {
      const params: GlobToolParams = {
        pattern: '*.js',
        path: 'sub',
        case_sensitive: true,
      };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing (schema validation)', () => {
      // Need to correctly define this as an object without pattern
      const params = { path: '.' };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(globTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error if pattern is an empty string', () => {
      const params: GlobToolParams = { pattern: '' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if pattern is only whitespace', () => {
      const params: GlobToolParams = { pattern: '   ' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if path is provided but is not a string (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        path: 123,
      };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(globTool.validateToolParams(params)).toBe(
        'params/path must be string',
      );
    });

    it('should return error if case_sensitive is provided but is not a boolean (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        case_sensitive: 'true',
      };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(globTool.validateToolParams(params)).toBe(
        'params/case_sensitive must be boolean',
      );
    });

    it("should return error if search path resolves outside the tool's root directory", () => {
      // Create a globTool instance specifically for this test, with a deeper root
      tempRootDir = path.join(tempRootDir, 'sub');
      const specificGlobTool = new GlobTool(mockConfig);
      // const params: GlobToolParams = { pattern: '*.txt', path: '..' }; // This line is unused and will be removed.
      // This should be fine as tempRootDir is still within the original tempRootDir (the parent of deeperRootDir)
      // Let's try to go further up.
      const paramsOutside: GlobToolParams = {
        pattern: '*.txt',
        path: '../../../../../../../../../../tmp', // Definitely outside
      };
      expect(specificGlobTool.validateToolParams(paramsOutside)).toContain(
        'resolves outside the allowed workspace directories',
      );
    });

    it('should return error if specified search path does not exist', async () => {
      const params: GlobToolParams = {
        pattern: '*.txt',
        path: 'nonexistent_subdir',
      };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path does not exist',
      );
    });

    it('should return error if specified search path is a file, not a directory', async () => {
      const params: GlobToolParams = { pattern: '*.txt', path: 'fileA.txt' };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path is not a directory',
      );
    });
  });

  describe('workspace boundary validation', () => {
    it('should validate search paths are within workspace boundaries', () => {
      const validPath = { pattern: '*.ts', path: 'sub' };
      const invalidPath = { pattern: '*.ts', path: '../..' };

      expect(globTool.validateToolParams(validPath)).toBeNull();
      expect(globTool.validateToolParams(invalidPath)).toContain(
        'resolves outside the allowed workspace directories',
      );
    });

    it('should provide clear error messages when path is outside workspace', () => {
      const invalidPath = { pattern: '*.ts', path: '/etc' };
      const error = globTool.validateToolParams(invalidPath);

      expect(error).toContain(
        'resolves outside the allowed workspace directories',
      );
      expect(error).toContain(tempRootDir);
    });

    it('should work with paths in workspace subdirectories', async () => {
      const params: GlobToolParams = { pattern: '*.md', path: 'sub' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain('fileC.md');
      expect(result.llmContent).toContain('FileD.MD');
    });
  });
});

describe('sortFileEntries', () => {
  const nowTimestamp = new Date('2024-01-15T12:00:00.000Z').getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;

  const createFileEntry = (fullpath: string, mtimeDate: Date): GlobPath => ({
    fullpath: () => fullpath,
    mtimeMs: mtimeDate.getTime(),
  });

  it('should sort a mix of recent and older files correctly', () => {
    const recentTime1 = new Date(nowTimestamp - 1 * 60 * 60 * 1000); // 1 hour ago
    const recentTime2 = new Date(nowTimestamp - 2 * 60 * 60 * 1000); // 2 hours ago
    const olderTime1 = new Date(
      nowTimestamp - (oneDayInMs + 1 * 60 * 60 * 1000),
    ); // 25 hours ago
    const olderTime2 = new Date(
      nowTimestamp - (oneDayInMs + 2 * 60 * 60 * 1000),
    ); // 26 hours ago

    const entries: GlobPath[] = [
      createFileEntry('older_zebra.txt', olderTime2),
      createFileEntry('recent_alpha.txt', recentTime1),
      createFileEntry('older_apple.txt', olderTime1),
      createFileEntry('recent_beta.txt', recentTime2),
      createFileEntry('older_banana.txt', olderTime1), // Same mtime as apple
    ];

    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    const sortedPaths = sorted.map((e) => e.fullpath());

    expect(sortedPaths).toEqual([
      'recent_alpha.txt', // Recent, newest
      'recent_beta.txt', // Recent, older
      'older_apple.txt', // Older, alphabetical
      'older_banana.txt', // Older, alphabetical
      'older_zebra.txt', // Older, alphabetical
    ]);
  });

  it('should sort only recent files by mtime descending', () => {
    const recentTime1 = new Date(nowTimestamp - 1000); // Newest
    const recentTime2 = new Date(nowTimestamp - 2000);
    const recentTime3 = new Date(nowTimestamp - 3000); // Oldest recent

    const entries: GlobPath[] = [
      createFileEntry('c.txt', recentTime2),
      createFileEntry('a.txt', recentTime3),
      createFileEntry('b.txt', recentTime1),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'b.txt',
      'c.txt',
      'a.txt',
    ]);
  });

  it('should sort only older files alphabetically by path', () => {
    const olderTime = new Date(nowTimestamp - 2 * oneDayInMs); // All equally old
    const entries: GlobPath[] = [
      createFileEntry('zebra.txt', olderTime),
      createFileEntry('apple.txt', olderTime),
      createFileEntry('banana.txt', olderTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'apple.txt',
      'banana.txt',
      'zebra.txt',
    ]);
  });

  it('should handle an empty array', () => {
    const entries: GlobPath[] = [];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted).toEqual([]);
  });

  it('should correctly sort files when mtimes are identical for older files', () => {
    const olderTime = new Date(nowTimestamp - 2 * oneDayInMs);
    const entries: GlobPath[] = [
      createFileEntry('b.txt', olderTime),
      createFileEntry('a.txt', olderTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toEqual(['a.txt', 'b.txt']);
  });

  it('should correctly sort files when mtimes are identical for recent files (maintaining mtime sort)', () => {
    const recentTime = new Date(nowTimestamp - 1000);
    const entries: GlobPath[] = [
      createFileEntry('b.txt', recentTime),
      createFileEntry('a.txt', recentTime),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, oneDayInMs);
    expect(sorted.map((e) => e.fullpath())).toContain('a.txt');
    expect(sorted.map((e) => e.fullpath())).toContain('b.txt');
    expect(sorted.length).toBe(2);
  });

  it('should use recencyThresholdMs parameter correctly', () => {
    const justOverThreshold = new Date(nowTimestamp - (1000 + 1)); // Barely older
    const justUnderThreshold = new Date(nowTimestamp - (1000 - 1)); // Barely recent
    const customThresholdMs = 1000; // 1 second

    const entries: GlobPath[] = [
      createFileEntry('older_file.txt', justOverThreshold),
      createFileEntry('recent_file.txt', justUnderThreshold),
    ];
    const sorted = sortFileEntries(entries, nowTimestamp, customThresholdMs);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'recent_file.txt',
      'older_file.txt',
    ]);
  });
});
