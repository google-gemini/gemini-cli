/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileSearchTool, FileSearchToolParams } from './file-search.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { Config } from '../config/config.js';

describe('FileSearchTool', () => {
  let tempRootDir: string;
  let fileSearchTool: FileSearchTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getFileService: () => new FileDiscoveryService(tempRootDir),
    getFileFilteringRespectGitIgnore: () => true,
  } as Partial<Config> as Config;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'fileSearch-tool-root-'),
    );
    fileSearchTool = new FileSearchTool(tempRootDir, mockConfig);

    await fs.writeFile(path.join(tempRootDir, 'fileA.txt'), 'contentA');
    await fs.writeFile(path.join(tempRootDir, 'FileB.TXT'), 'contentB');

    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(path.join(tempRootDir, 'sub', 'fileC.md'), 'contentC');
    await fs.writeFile(path.join(tempRootDir, 'sub', 'FileD.MD'), 'contentD');

    await fs.mkdir(path.join(tempRootDir, 'sub', 'deep'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      'contentE',
    );
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should find files matching a simple pattern in the root', async () => {
      const params: FileSearchToolParams = { pattern: '\\.txt$' };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
      expect(result.returnDisplay).toBe('Found 2 matching file(s)');
    });

    it('should find files case-sensitively when case_sensitive is true', async () => {
      const params: FileSearchToolParams = {
        pattern: '\\.txt$',
        case_sensitive: true,
      };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).not.toContain(
        path.join(tempRootDir, 'FileB.TXT'),
      );
    });

    it('should find files case-insensitively by default (pattern: *.TXT)', async () => {
      const params: FileSearchToolParams = { pattern: '\\.txt$' };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files case-insensitively when case_sensitive is false (pattern: *.TXT)', async () => {
      const params: FileSearchToolParams = {
        pattern: '\\.TXT$',
        case_sensitive: false,
      };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files using a pattern that includes a subdirectory', async () => {
      const params: FileSearchToolParams = {
        pattern: '\\.md$',
        case_sensitive: false,
      };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files in a specified relative path (relative to rootDir)', async () => {
      const params: FileSearchToolParams = { pattern: '\\.md$', path: 'sub' };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'fileC.md'),
      );
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'FileD.MD'),
      );
    });

    it('should find files using a deep fileSearchstar pattern (e.g., **/*.log)', async () => {
      const params: FileSearchToolParams = { pattern: '\\.log$' };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      );
    });

    it('should return "No files found" message when pattern matches nothing', async () => {
      const params: FileSearchToolParams = { pattern: '\\.nonexistent$' };
      const result = await fileSearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('No files found matching pattern');
      expect(result.returnDisplay).toBe('No files found');
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters (pattern only)', () => {
      const params: FileSearchToolParams = { pattern: '*.js' };
      expect(fileSearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern and path)', () => {
      const params: FileSearchToolParams = { pattern: '*.js', path: 'sub' };
      expect(fileSearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters (pattern, path, and case_sensitive)', () => {
      const params: FileSearchToolParams = {
        pattern: '*.js',
        path: 'sub',
        case_sensitive: true,
      };
      expect(fileSearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing (schema validation)', () => {
      const params = { path: '.' };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(fileSearchTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
      );
    });

    it('should return error if pattern is an empty string', () => {
      const params: FileSearchToolParams = { pattern: '' };
      expect(fileSearchTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if pattern is only whitespace', () => {
      const params: FileSearchToolParams = { pattern: '   ' };
      expect(fileSearchTool.validateToolParams(params)).toContain(
        "The 'pattern' parameter cannot be empty.",
      );
    });

    it('should return error if path is provided but is not a string (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        path: 123,
      };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(fileSearchTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
      );
    });

    it('should return error if case_sensitive is provided but is not a boolean (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        case_sensitive: 'true',
      };
      // @ts-expect-error - We're intentionally creating invalid params for testing
      expect(fileSearchTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
      );
    });

    it("should return error if search path resolves outside the tool's root directory", () => {
      const deeperRootDir = path.join(tempRootDir, 'sub');
      const specificFileSearchTool = new FileSearchTool(
        deeperRootDir,
        mockConfig,
      );
      const paramsOutside: FileSearchToolParams = {
        pattern: '*.txt',
        path: '../../../../../../../../../../tmp',
      };
      expect(
        specificFileSearchTool.validateToolParams(paramsOutside),
      ).toContain("resolves outside the tool's root directory");
    });

    it('should return error if specified search path does not exist', async () => {
      const params: FileSearchToolParams = {
        pattern: '*.txt',
        path: 'nonexistent_subdir',
      };
      expect(fileSearchTool.validateToolParams(params)).toContain(
        'Search path does not exist',
      );
    });

    it('should return error if specified search path is a file, not a directory', async () => {
      const params: FileSearchToolParams = {
        pattern: '*.txt',
        path: 'fileA.txt',
      };
      expect(fileSearchTool.validateToolParams(params)).toContain(
        'Search path is not a directory',
      );
    });
  });
});
