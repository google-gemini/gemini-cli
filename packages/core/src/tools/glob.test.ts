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
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

vi.mock('glob', { spy: true });

describe('GlobTool', () => {
  let tempRootDir: string; // This will be the rootDirectory for the GlobTool instance
  let globTool: GlobTool;
  const abortSignal = new AbortController().signal;

  // Mock config for testing
  const mockConfig = {
    getFileService: () => new FileDiscoveryService(tempRootDir),
    getFileFilteringRespectGitIgnore: () => true,
    getFileFilteringOptions: () => ({
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    }),
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    getFileExclusions: () => ({
      getGlobExcludes: () => [],
    }),
  } as unknown as Config;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-tool-root-'));
    await fs.writeFile(path.join(tempRootDir, '.git'), ''); // Fake git repo
    globTool = new GlobTool(mockConfig, createMockMessageBus());

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
      const params: GlobToolParams = { pattern: '*.md', dir_path: 'sub' };
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
      const params: GlobToolParams = { pattern: '*.txt', dir_path: '/etc' };
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
    it.each([
      {
        name: 'should return null for valid parameters (pattern only)',
        params: { pattern: '*.js' },
        expected: null,
      },
      {
        name: 'should return null for valid parameters (pattern and dir_path)',
        params: { pattern: '*.js', dir_path: 'sub' },
        expected: null,
      },
      {
        name: 'should return null for valid parameters (pattern, dir_path, and case_sensitive)',
        params: { pattern: '*.js', dir_path: 'sub', case_sensitive: true },
        expected: null,
      },
      {
        name: 'should return error if pattern is missing (schema validation)',
        params: { dir_path: '.' },
        expected: `params must have required property 'pattern'`,
      },
      {
        name: 'should return error if pattern is an empty string',
        params: { pattern: '' },
        expected: "The 'pattern' parameter cannot be empty.",
      },
      {
        name: 'should return error if pattern is only whitespace',
        params: { pattern: '   ' },
        expected: "The 'pattern' parameter cannot be empty.",
      },
      {
        name: 'should return error if dir_path is not a string (schema validation)',
        params: { pattern: '*.ts', dir_path: 123 },
        expected: 'params/dir_path must be string',
      },
      {
        name: 'should return error if case_sensitive is not a boolean (schema validation)',
        params: { pattern: '*.ts', case_sensitive: 'true' },
        expected: 'params/case_sensitive must be boolean',
      },
      {
        name: "should return error if search path resolves outside the tool's root directory",
        params: {
          pattern: '*.txt',
          dir_path: '../../../../../../../../../../tmp',
        },
        expected: 'resolves outside the allowed workspace directories',
      },
      {
        name: 'should return error if specified search path does not exist',
        params: { pattern: '*.txt', dir_path: 'nonexistent_subdir' },
        expected: 'Search path does not exist',
      },
      {
        name: 'should return error if specified search path is a file, not a directory',
        params: { pattern: '*.txt', dir_path: 'fileA.txt' },
        expected: 'Search path is not a directory',
      },
    ])('$name', ({ params, expected }) => {
      // @ts-expect-error - We're intentionally creating invalid params for testing
      const result = globTool.validateToolParams(params);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toContain(expected);
      }
    });
  });

  describe('workspace boundary validation', () => {
    it('should validate search paths are within workspace boundaries', () => {
      const validPath = { pattern: '*.ts', dir_path: 'sub' };
      const invalidPath = { pattern: '*.ts', dir_path: '../..' };

      expect(globTool.validateToolParams(validPath)).toBeNull();
      expect(globTool.validateToolParams(invalidPath)).toContain(
        'resolves outside the allowed workspace directories',
      );
    });

    it('should provide clear error messages when path is outside workspace', () => {
      const invalidPath = { pattern: '*.ts', dir_path: '/etc' };
      const error = globTool.validateToolParams(invalidPath);

      expect(error).toContain(
        'resolves outside the allowed workspace directories',
      );
      expect(error).toContain(tempRootDir);
    });

    it('should work with paths in workspace subdirectories', async () => {
      const params: GlobToolParams = { pattern: '*.md', dir_path: 'sub' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain('fileC.md');
      expect(result.llmContent).toContain('FileD.MD');
    });
  });

  describe('ignore file handling', () => {
    interface IgnoreFileTestCase {
      name: string;
      ignoreFile: { name: string; content: string };
      filesToCreate: string[];
      globToolParams: GlobToolParams;
      expectedCountMessage: string;
      expectedToContain?: string[];
      notExpectedToContain?: string[];
    }

    it.each<IgnoreFileTestCase>([
      {
        name: 'should respect .gitignore files by default',
        ignoreFile: { name: '.gitignore', content: '*.ignored.txt' },
        filesToCreate: ['a.ignored.txt', 'b.notignored.txt'],
        globToolParams: { pattern: '*.txt' },
        expectedCountMessage: 'Found 3 file(s)',
        notExpectedToContain: ['a.ignored.txt'],
      },
      {
        name: 'should respect .geminiignore files by default',
        ignoreFile: { name: '.geminiignore', content: '*.geminiignored.txt' },
        filesToCreate: ['a.geminiignored.txt', 'b.notignored.txt'],
        globToolParams: { pattern: '*.txt' },
        expectedCountMessage: 'Found 3 file(s)',
        notExpectedToContain: ['a.geminiignored.txt'],
      },
      {
        name: 'should not respect .gitignore when respect_git_ignore is false',
        ignoreFile: { name: '.gitignore', content: '*.ignored.txt' },
        filesToCreate: ['a.ignored.txt'],
        globToolParams: { pattern: '*.txt', respect_git_ignore: false },
        expectedCountMessage: 'Found 3 file(s)',
        expectedToContain: ['a.ignored.txt'],
      },
      {
        name: 'should not respect .geminiignore when respect_gemini_ignore is false',
        ignoreFile: { name: '.geminiignore', content: '*.geminiignored.txt' },
        filesToCreate: ['a.geminiignored.txt'],
        globToolParams: { pattern: '*.txt', respect_gemini_ignore: false },
        expectedCountMessage: 'Found 3 file(s)',
        expectedToContain: ['a.geminiignored.txt'],
      },
    ])(
      '$name',
      async ({
        ignoreFile,
        filesToCreate,
        globToolParams,
        expectedCountMessage,
        expectedToContain,
        notExpectedToContain,
      }) => {
        await fs.writeFile(
          path.join(tempRootDir, ignoreFile.name),
          ignoreFile.content,
        );
        for (const file of filesToCreate) {
          await fs.writeFile(path.join(tempRootDir, file), 'content');
        }

        const invocation = globTool.build(globToolParams);
        const result = await invocation.execute(abortSignal);

        expect(result.llmContent).toContain(expectedCountMessage);

        if (expectedToContain) {
          for (const file of expectedToContain) {
            expect(result.llmContent).toContain(file);
          }
        }
        if (notExpectedToContain) {
          for (const file of notExpectedToContain) {
            expect(result.llmContent).not.toContain(file);
          }
        }
      },
    );
  });
});

describe('sortFileEntries', () => {
  const nowTimestamp = new Date('2024-01-15T12:00:00.000Z').getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;

  const createFileEntry = (fullpath: string, mtimeDate: Date): GlobPath => ({
    fullpath: () => fullpath,
    mtimeMs: mtimeDate.getTime(),
  });

  const testCases = [
    {
      name: 'should sort a mix of recent and older files correctly',
      entries: [
        {
          name: 'older_zebra.txt',
          mtime: new Date(nowTimestamp - (oneDayInMs + 2 * 60 * 60 * 1000)),
        },
        {
          name: 'recent_alpha.txt',
          mtime: new Date(nowTimestamp - 1 * 60 * 60 * 1000),
        },
        {
          name: 'older_apple.txt',
          mtime: new Date(nowTimestamp - (oneDayInMs + 1 * 60 * 60 * 1000)),
        },
        {
          name: 'recent_beta.txt',
          mtime: new Date(nowTimestamp - 2 * 60 * 60 * 1000),
        },
        {
          name: 'older_banana.txt',
          mtime: new Date(nowTimestamp - (oneDayInMs + 1 * 60 * 60 * 1000)),
        },
      ],
      expected: [
        'recent_alpha.txt',
        'recent_beta.txt',
        'older_apple.txt',
        'older_banana.txt',
        'older_zebra.txt',
      ],
    },
    {
      name: 'should sort only recent files by mtime descending',
      entries: [
        { name: 'c.txt', mtime: new Date(nowTimestamp - 2000) },
        { name: 'a.txt', mtime: new Date(nowTimestamp - 3000) },
        { name: 'b.txt', mtime: new Date(nowTimestamp - 1000) },
      ],
      expected: ['b.txt', 'c.txt', 'a.txt'],
    },
    {
      name: 'should sort only older files alphabetically by path',
      entries: [
        { name: 'zebra.txt', mtime: new Date(nowTimestamp - 2 * oneDayInMs) },
        { name: 'apple.txt', mtime: new Date(nowTimestamp - 2 * oneDayInMs) },
        { name: 'banana.txt', mtime: new Date(nowTimestamp - 2 * oneDayInMs) },
      ],
      expected: ['apple.txt', 'banana.txt', 'zebra.txt'],
    },
    {
      name: 'should handle an empty array',
      entries: [],
      expected: [],
    },
    {
      name: 'should correctly sort files when mtimes are identical for recent files',
      entries: [
        { name: 'b.txt', mtime: new Date(nowTimestamp - 1000) },
        { name: 'a.txt', mtime: new Date(nowTimestamp - 1000) },
      ],
      expectedUnordered: ['a.txt', 'b.txt'],
    },
    {
      name: 'should use recencyThresholdMs parameter correctly',
      recencyThresholdMs: 1000,
      entries: [
        { name: 'older_file.txt', mtime: new Date(nowTimestamp - 1001) },
        { name: 'recent_file.txt', mtime: new Date(nowTimestamp - 999) },
      ],
      expected: ['recent_file.txt', 'older_file.txt'],
    },
  ];

  it.each(testCases)(
    '$name',
    ({ entries, expected, expectedUnordered, recencyThresholdMs }) => {
      const globPaths = entries.map((e) => createFileEntry(e.name, e.mtime));
      const sorted = sortFileEntries(
        globPaths,
        nowTimestamp,
        recencyThresholdMs ?? oneDayInMs,
      );
      const sortedPaths = sorted.map((e) => e.fullpath());

      if (expected) {
        expect(sortedPaths).toEqual(expected);
      } else if (expectedUnordered) {
        expect(sortedPaths).toHaveLength(expectedUnordered.length);
        for (const path of expectedUnordered) {
          expect(sortedPaths).toContain(path);
        }
      } else {
        throw new Error('Test case must have expected or expectedUnordered');
      }
    },
  );
});
