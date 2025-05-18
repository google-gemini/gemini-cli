/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobTool, GlobToolParams } from './glob.js';
// import { ToolResult } from './tools.js'; // ToolResult is implicitly used by execute
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // Removed vi

describe('GlobTool', () => {
  let tempRootDir: string; // This will be the rootDirectory for the GlobTool instance
  let globTool: GlobTool;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-tool-root-'));
    globTool = new GlobTool(tempRootDir);

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
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
      expect(result.returnDisplay).toBe('Found 2 matching file(s)');
    });

    it('should find files case-sensitively when case_sensitive is true', async () => {
      const params: GlobToolParams = { pattern: '*.txt', case_sensitive: true };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).not.toContain(
        path.join(tempRootDir, 'FileB.TXT'),
      );
    });

    it('should find files case-insensitively by default (pattern: *.TXT)', async () => {
      const params: GlobToolParams = { pattern: '*.TXT' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files case-insensitively when case_sensitive is false (pattern: *.TXT)', async () => {
      const params: GlobToolParams = {
        pattern: '*.TXT',
        case_sensitive: false,
      };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      expect(result.llmContent).toContain(path.join(tempRootDir, 'fileA.txt'));
      expect(result.llmContent).toContain(path.join(tempRootDir, 'FileB.TXT'));
    });

    it('should find files using a pattern that includes a subdirectory', async () => {
      const params: GlobToolParams = { pattern: 'sub/*.md' };
      const result = await globTool.execute(params, abortSignal);
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
      const result = await globTool.execute(params, abortSignal);
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
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 file(s)');
      expect(result.llmContent).toContain(
        path.join(tempRootDir, 'sub', 'deep', 'fileE.log'),
      );
    });

    it('should return "No files found" message when pattern matches nothing', async () => {
      const params: GlobToolParams = { pattern: '*.nonexistent' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'No files found matching pattern "*.nonexistent"',
      );
      expect(result.returnDisplay).toBe('No files found');
    });

    it('should correctly sort files by modification time (newest first)', async () => {
      const params: GlobToolParams = { pattern: '*.sortme' };
      const result = await globTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 file(s)');
      const filesListed = result.llmContent
        .substring(result.llmContent.indexOf(':') + 1)
        .trim()
        .split('\n');
      expect(filesListed[0]).toContain(path.join(tempRootDir, 'newer.sortme'));
      expect(filesListed[1]).toContain(path.join(tempRootDir, 'older.sortme'));
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
      const params = { path: '.' } as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
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
      } as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
      );
    });

    it('should return error if case_sensitive is provided but is not a boolean (schema validation)', () => {
      const params = {
        pattern: '*.ts',
        case_sensitive: 'true',
      } as unknown as GlobToolParams;
      expect(globTool.validateToolParams(params)).toContain(
        'Parameters failed schema validation',
      );
    });

    it("should return error if search path resolves outside the tool's root directory", () => {
      // Create a globTool instance specifically for this test, with a deeper root
      const deeperRootDir = path.join(tempRootDir, 'sub');
      const specificGlobTool = new GlobTool(deeperRootDir);
      // const params: GlobToolParams = { pattern: '*.txt', path: '..' }; // This line is unused and will be removed.
      // This should be fine as tempRootDir is still within the original tempRootDir (the parent of deeperRootDir)
      // Let's try to go further up.
      const paramsOutside: GlobToolParams = {
        pattern: '*.txt',
        path: '../../../../../../../../../../tmp',
      }; // Definitely outside
      expect(specificGlobTool.validateToolParams(paramsOutside)).toContain(
        "resolves outside the tool's root directory",
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
});
