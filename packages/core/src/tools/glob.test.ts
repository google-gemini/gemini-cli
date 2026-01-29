/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GlobToolParams, GlobPath } from './glob.js';
import { GlobTool, sortFileEntries } from './glob.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import path from 'node:path';
import { isSubpath } from '../utils/paths.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import type { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { ToolErrorType } from './tool-error.js';
import * as glob from 'glob';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  GEMINI_IGNORE_FILE_NAME,
} from '../config/constants.js';

vi.mock('glob', { spy: true });

describe('GlobTool', () => {
  let tempRootDir: string; // This will be the rootDirectory for the GlobTool instance
  let globTool: GlobTool;
  const abortSignal = new AbortController().signal;
  let mockConfig: Config;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-tool-root-'));
    await fs.writeFile(path.join(tempRootDir, '.git'), ''); // Fake git repo

    const rootDir = tempRootDir;
    const workspaceContext = createMockWorkspaceContext(rootDir);
    const fileDiscovery = new FileDiscoveryService(rootDir);

    const mockStorage = {
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
    };

    mockConfig = {
      getTargetDir: () => rootDir,
      getWorkspaceContext: () => workspaceContext,
      getFileService: () => fileDiscovery,
      getFileFilteringOptions: () => DEFAULT_FILE_FILTERING_OPTIONS,
      getFileExclusions: () => ({ getGlobExcludes: () => [] }),
      storage: mockStorage,
      isPathAllowed(this: Config, absolutePath: string): boolean {
        const workspaceContext = this.getWorkspaceContext();
        if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
          return true;
        }

        const projectTempDir = this.storage.getProjectTempDir();
        return isSubpath(path.resolve(projectTempDir), absolutePath);
      },
      validatePathAccess(this: Config, absolutePath: string): string | null {
        if (this.isPathAllowed(absolutePath)) {
          return null;
        }

        const workspaceDirs = this.getWorkspaceContext().getDirectories();
        const projectTempDir = this.storage.getProjectTempDir();
        return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
      },
    } as unknown as Config;

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
    vi.resetAllMocks();
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
    }, 30000);

    it('should find files case-sensitively when case_sensitive is true', async () => {
      const params: GlobToolParams = { pattern: '*.txt', case_sensitive: true };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).not.toContain(
        path.join(tempRootDir, 'FileB.TXT'),
      );
    }, 30000);

    it('should find files case-insensitively by default (pattern: *.TXT)', async () => {
      const params: GlobToolParams = { pattern: '*.TXT' };
      const invocation = globTool.build(params);

      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('fileA.txt');
      expect(result.llmContent).toContain('FileB.TXT');
    }, 30000);

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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

    it('should find files using a deep globstar pattern (e.g., **/*.log)', async () => {
      const params: GlobToolParams = { pattern: '**/*.log' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      );
    }, 30000);

    it('should return "No files found" message when pattern matches nothing', async () => {
      const params: GlobToolParams = { pattern: '*.nonexistent' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'No files found matching pattern "*.nonexistent"',
      );
      expect(result.returnDisplay).toBe('No files found');
    }, 30000);

    it('should find files with special characters in the name', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file[1].txt'), 'content');
      const params: GlobToolParams = { pattern: 'file[1].txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'file[1].txt'),
      );
    }, 30000);

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
    }, 30000);

    it('should correctly sort files by modification time (newest first)', async () => {
      const params: GlobToolParams = { pattern: '*.sortme' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      const llmContent = partListUnionToString(result.llmContent);
      const newerIndex = llmContent.indexOf('newer.sortme');
      const olderIndex = llmContent.indexOf('older.sortme');
      expect(newerIndex).toBeLessThan(olderIndex);
    }, 30000);

    it('should return a PATH_NOT_IN_WORKSPACE error if path is outside workspace', async () => {
      const params: GlobToolParams = { pattern: '*', dir_path: '/etc' };
      expect(() => globTool.build(params)).toThrow(/Path not in workspace/);
    });

    it('should return a GLOB_EXECUTION_ERROR on glob failure', async () => {
      vi.mocked(glob.glob).mockRejectedValue(new Error('Glob failed'));
      const params: GlobToolParams = { pattern: '*' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.error?.type).toBe(ToolErrorType.GLOB_EXECUTION_ERROR);
    }, 30000);
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters', () => {
      const params: GlobToolParams = { pattern: '*.txt' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters with dir_path', () => {
      const params: GlobToolParams = { pattern: '*.txt', dir_path: 'sub' };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters with absolute dir_path within workspace', async () => {
      const params: GlobToolParams = {
        pattern: '*.txt',
        dir_path: tempRootDir,
      };
      expect(globTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing', () => {
      const params = {} as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        "params must have required property 'pattern'",
      );
    });

    it('should return error if pattern is an empty string', () => {
      const params: GlobToolParams = { pattern: '' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty",
      );
    });

    it('should return error if pattern is only whitespace', () => {
      const params: GlobToolParams = { pattern: '   ' };
      expect(globTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty",
      );
    });

    it('should return error if dir_path is not a string', () => {
      const params = {
        pattern: '*',
        dir_path: 123,
      } as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        'params/dir_path must be string',
      );
    });

    it('should return error if case_sensitive is not a boolean', () => {
      const params = {
        pattern: '*',
        case_sensitive: 'true',
      } as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        'params/case_sensitive must be boolean',
      );
    });

    it('should return error if search path resolves outside workspace', () => {
      const params: GlobToolParams = { pattern: '*', dir_path: '../' };
      expect(globTool.validateToolParams(params)).toContain(
        'resolves outside the allowed workspace directories',
      );
    });

    it('should return error if specified search path does not exist', () => {
      const params: GlobToolParams = {
        pattern: '*',
        dir_path: 'non-existent',
      };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path does not exist',
      );
    });

    it('should return error if specified search path is not a directory', async () => {
      await fs.writeFile(path.join(tempRootDir, 'not-a-dir'), 'content');
      const params: GlobToolParams = { pattern: '*', dir_path: 'not-a-dir' };
      expect(globTool.validateToolParams(params)).toContain(
        'Search path is not a directory',
      );
    });
  });

  describe('workspace boundary validation', () => {
    it('should validate search paths are within workspace boundaries', () => {
      expect(globTool.validateToolParams({ pattern: '*' })).toBeNull();
      expect(
        globTool.validateToolParams({ pattern: '*', dir_path: '.' }),
      ).toBeNull();
      expect(
        globTool.validateToolParams({ pattern: '*', dir_path: tempRootDir }),
      ).toBeNull();

      expect(
        globTool.validateToolParams({ pattern: '*', dir_path: '..' }),
      ).toContain('resolves outside the allowed workspace directories');
      expect(
        globTool.validateToolParams({ pattern: '*', dir_path: '/' }),
      ).toContain('resolves outside the allowed workspace directories');
    });

    it('should provide clear error messages when path is outside workspace', () => {
      const result = globTool.validateToolParams({
        pattern: '*',
        dir_path: '/tmp/outside',
      });
      expect(result).toContain(
        'resolves outside the allowed workspace directories',
      );
    });

    it('should work with paths in workspace subdirectories', async () => {
      const subDir = path.join(tempRootDir, 'allowed-sub');
      await fs.mkdir(subDir);
      expect(
        globTool.validateToolParams({ pattern: '*', dir_path: 'allowed-sub' }),
      ).toBeNull();
    });
  });

  describe('ignore file handling', () => {
    it('should respect .gitignore files by default', async () => {
      await fs.writeFile(
        path.join(tempRootDir, '.gitignore'),
        'ignored_test.txt',
      );
      await fs.writeFile(path.join(tempRootDir, 'ignored_test.txt'), 'content');
      await fs.writeFile(path.join(tempRootDir, 'visible_test.txt'), 'content');

      const params: GlobToolParams = { pattern: '*_test.txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain('visible_test.txt');
      expect(result.llmContent).not.toContain('ignored_test.txt');
    }, 30000);

    it('should respect .geminiignore files by default', async () => {
      await fs.writeFile(
        path.join(tempRootDir, GEMINI_IGNORE_FILE_NAME),
        'gemini-ignored_test.txt',
      );
      await fs.writeFile(
        path.join(tempRootDir, 'gemini-ignored_test.txt'),
        'content',
      );
      await fs.writeFile(path.join(tempRootDir, 'visible_test.txt'), 'content');

      const params: GlobToolParams = { pattern: 'visible_test.txt' };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain('visible_test.txt');
      expect(result.llmContent).not.toContain('gemini-ignored_test.txt');
    }, 30000);

    it('should not respect .gitignore when respect_git_ignore is false', async () => {
      await fs.writeFile(
        path.join(tempRootDir, '.gitignore'),
        'ignored_test.txt',
      );
      await fs.writeFile(path.join(tempRootDir, 'ignored_test.txt'), 'content');

      const params: GlobToolParams = {
        pattern: 'ignored_test.txt',
        respect_git_ignore: false,
      };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain('ignored_test.txt');
    }, 30000);

    it('should not respect .geminiignore when respect_gemini_ignore is false', async () => {
      await fs.writeFile(
        path.join(tempRootDir, GEMINI_IGNORE_FILE_NAME),
        'gemini-ignored_test.txt',
      );
      await fs.writeFile(
        path.join(tempRootDir, 'gemini-ignored_test.txt'),
        'content',
      );

      const params: GlobToolParams = {
        pattern: 'gemini-ignored_test.txt',
        respect_gemini_ignore: false,
      };
      const invocation = globTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain('gemini-ignored_test.txt');
    }, 30000);
  });
});

describe('sortFileEntries', () => {
  const now = 1000000;
  const threshold = 10000;

  it('should sort a mix of recent and older files correctly', () => {
    const entries: GlobPath[] = [
      { fullpath: () => 'older-b.txt', mtimeMs: now - 20000 },
      { fullpath: () => 'recent-b.txt', mtimeMs: now - 1000 },
      { fullpath: () => 'recent-a.txt', mtimeMs: now - 500 },
      { fullpath: () => 'older-a.txt', mtimeMs: now - 30000 },
    ];

    const sorted = sortFileEntries(entries, now, threshold);
    expect(sorted.map((e) => e.fullpath())).toEqual([
      'recent-a.txt', // Recent, newest first
      'recent-b.txt',
      'older-a.txt', // Older, alphabetical
      'older-b.txt',
    ]);
  });

  it('should sort only recent files by mtime descending', () => {
    const entries: GlobPath[] = [
      { fullpath: () => 'a.txt', mtimeMs: now - 2000 },
      { fullpath: () => 'b.txt', mtimeMs: now - 1000 },
    ];
    const sorted = sortFileEntries(entries, now, threshold);
    expect(sorted.map((e) => e.fullpath())).toEqual(['b.txt', 'a.txt']);
  });

  it('should sort only older files alphabetically', () => {
    const entries: GlobPath[] = [
      { fullpath: () => 'b.txt', mtimeMs: now - 20000 },
      { fullpath: () => 'a.txt', mtimeMs: now - 30000 },
    ];
    const sorted = sortFileEntries(entries, now, threshold);
    expect(sorted.map((e) => e.fullpath())).toEqual(['a.txt', 'b.txt']);
  });

  it('should handle an empty array', () => {
    expect(sortFileEntries([], now, threshold)).toEqual([]);
  });

  it('should correctly sort files when mtimeMs is missing', () => {
    const entries: GlobPath[] = [
      { fullpath: () => 'b.txt' },
      { fullpath: () => 'a.txt' },
    ];
    const sorted = sortFileEntries(entries, now, threshold);
    expect(sorted.map((e) => e.fullpath())).toEqual(['a.txt', 'b.txt']);
  });

  it('should use recencyThresholdMs parameter', () => {
    const customThreshold = 5000;
    const entries: GlobPath[] = [
      { fullpath: () => 'old.txt', mtimeMs: now - 8000 },
      { fullpath: () => 'new.txt', mtimeMs: now - 3000 },
    ];
    const sorted = sortFileEntries(entries, now, customThreshold);
    expect(sorted.map((e) => e.fullpath())).toEqual(['new.txt', 'old.txt']);
  });
});
