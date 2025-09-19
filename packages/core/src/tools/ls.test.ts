/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LSTool } from './ls.js';
import type { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { ToolErrorType } from './tool-error.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

describe('LSTool', () => {
  let lsTool: LSTool;
  let tempRootDir: string;
  let tempSecondaryDir: string;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-tool-root-'));
    tempSecondaryDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ls-tool-secondary-'),
    );

    const mockWorkspaceContext = createMockWorkspaceContext(tempRootDir, [
      tempSecondaryDir,
    ]);

    mockConfig = {
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => mockWorkspaceContext,
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
    } as unknown as Config;

    lsTool = new LSTool(mockConfig);
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
    await fs.rm(tempSecondaryDir, { recursive: true, force: true });
  });

  describe('parameter validation', () => {
    it('should accept valid absolute paths within workspace', async () => {
      const testPath = path.join(tempRootDir, 'src');
      await fs.mkdir(testPath);

      const invocation = lsTool.build({ path: testPath });

      expect(invocation).toBeDefined();
    });

    it('should reject relative paths', () => {
      expect(() => lsTool.build({ path: './src' })).toThrow(
        'Path must be absolute: ./src',
      );
    });

    it('should reject paths outside workspace with clear error message', () => {
      expect(() => lsTool.build({ path: '/etc/passwd' })).toThrow(
        `Path must be within one of the workspace directories: ${tempRootDir}, ${tempSecondaryDir}`,
      );
    });

    it('should accept paths in secondary workspace directory', async () => {
      const testPath = path.join(tempSecondaryDir, 'lib');
      await fs.mkdir(testPath);

      const invocation = lsTool.build({ path: testPath });

      expect(invocation).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should list files in a directory', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      await fs.mkdir(path.join(tempRootDir, 'subdir'));
      await fs.writeFile(
        path.join(tempSecondaryDir, 'secondary-file.txt'),
        'secondary',
      );

      const invocation = lsTool.build({ path: tempRootDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('[DIR] subdir');
      expect(result.llmContent).toContain('file1.txt');
      expect(result.returnDisplay).toBe('Listed 2 item(s).');
    });

    it('should list files from secondary workspace directory', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      await fs.mkdir(path.join(tempRootDir, 'subdir'));
      await fs.writeFile(
        path.join(tempSecondaryDir, 'secondary-file.txt'),
        'secondary',
      );

      const invocation = lsTool.build({ path: tempSecondaryDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('secondary-file.txt');
      expect(result.returnDisplay).toBe('Listed 1 item(s).');
    });

    it('should handle empty directories', async () => {
      const emptyDir = path.join(tempRootDir, 'empty');
      await fs.mkdir(emptyDir);
      const invocation = lsTool.build({ path: emptyDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toBe(`Directory ${emptyDir} is empty.`);
      expect(result.returnDisplay).toBe('Directory is empty.');
    });

    it('should respect ignore patterns', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempRootDir, 'file2.log'), 'content1');

      const invocation = lsTool.build({
        path: tempRootDir,
        ignore: ['*.log'],
      });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).not.toContain('file2.log');
      expect(result.returnDisplay).toBe('Listed 1 item(s).');
    });

    it('should respect gitignore patterns', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempRootDir, 'file2.log'), 'content1');
      await fs.writeFile(path.join(tempRootDir, '.git'), '');
      await fs.writeFile(path.join(tempRootDir, '.gitignore'), '*.log');
      const invocation = lsTool.build({ path: tempRootDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).not.toContain('file2.log');
      // .git is always ignored by default.
      expect(result.returnDisplay).toBe('Listed 2 item(s). (2 git-ignored)');
    });

    it('should respect geminiignore patterns', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempRootDir, 'file2.log'), 'content1');
      await fs.writeFile(path.join(tempRootDir, '.geminiignore'), '*.log');
      const invocation = lsTool.build({ path: tempRootDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).not.toContain('file2.log');
      expect(result.returnDisplay).toBe('Listed 2 item(s). (1 gemini-ignored)');
    });

    it('should handle non-directory paths', async () => {
      const testPath = path.join(tempRootDir, 'file1.txt');
      await fs.writeFile(testPath, 'content1');

      const invocation = lsTool.build({ path: testPath });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Path is not a directory');
      expect(result.returnDisplay).toBe('Error: Path is not a directory.');
      expect(result.error?.type).toBe(ToolErrorType.PATH_IS_NOT_A_DIRECTORY);
    });

    it('should handle non-existent paths', async () => {
      const testPath = path.join(tempRootDir, 'does-not-exist');
      const invocation = lsTool.build({ path: testPath });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Error listing directory');
      expect(result.returnDisplay).toBe('Error: Failed to list directory.');
      expect(result.error?.type).toBe(ToolErrorType.LS_EXECUTION_ERROR);
    });

    it('should sort directories first, then files alphabetically', async () => {
      await fs.writeFile(path.join(tempRootDir, 'a-file.txt'), 'content1');
      await fs.writeFile(path.join(tempRootDir, 'b-file.txt'), 'content1');
      await fs.mkdir(path.join(tempRootDir, 'x-dir'));
      await fs.mkdir(path.join(tempRootDir, 'y-dir'));

      const invocation = lsTool.build({ path: tempRootDir });
      const result = await invocation.execute(abortSignal);

      const lines = (
        typeof result.llmContent === 'string' ? result.llmContent : ''
      )
        .split('\n')
        .filter(Boolean);
      const entries = lines.slice(1); // Skip header

      expect(entries[0]).toBe('[DIR] x-dir');
      expect(entries[1]).toBe('[DIR] y-dir');
      expect(entries[2]).toBe('a-file.txt');
      expect(entries[3]).toBe('b-file.txt');
    });

    it('should handle permission errors gracefully', async () => {
      const restrictedDir = path.join(tempRootDir, 'restricted');
      await fs.mkdir(restrictedDir);

      // To simulate a permission error in a cross-platform way,
      // we mock fs.readdir to throw an error.
      const error = new Error('EACCES: permission denied');
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(error);

      const invocation = lsTool.build({ path: restrictedDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Error listing directory');
      expect(result.llmContent).toContain('permission denied');
      expect(result.returnDisplay).toBe('Error: Failed to list directory.');
      expect(result.error?.type).toBe(ToolErrorType.LS_EXECUTION_ERROR);
    });

    it('should throw for invalid params at build time', () => {
      expect(() => lsTool.build({ path: '../outside' })).toThrow(
        'Path must be absolute: ../outside',
      );
    });

    it('should handle errors accessing individual files during listing', async () => {
      await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
      const problematicFile = path.join(tempRootDir, 'problematic.txt');
      await fs.writeFile(problematicFile, 'content2');

      // To simulate an error on a single file in a cross-platform way,
      // we mock fs.stat to throw for a specific file. This avoids
      // platform-specific behavior with things like dangling symlinks.
      const originalStat = fs.stat;
      const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (p) => {
        if (p.toString() === problematicFile) {
          throw new Error('Simulated stat error');
        }
        return originalStat(p);
      });

      // Spy on console.error to verify it's called
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const invocation = lsTool.build({ path: tempRootDir });
      const result = await invocation.execute(abortSignal);

      // Should still list the other files
      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).not.toContain('problematic.txt');
      expect(result.returnDisplay).toBe('Listed 1 item(s).');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Error accessing.*problematic\.txt/s),
      );

      statSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getDescription', () => {
    it('should return shortened relative path', () => {
      const deeplyNestedDir = path.join(tempRootDir, 'deeply', 'nested');
      const params = {
        path: path.join(deeplyNestedDir, 'directory'),
      };
      const invocation = lsTool.build(params);
      const description = invocation.getDescription();
      expect(description).toBe(path.join('deeply', 'nested', 'directory'));
    });

    it('should handle paths in secondary workspace', () => {
      const params = {
        path: path.join(tempSecondaryDir, 'lib'),
      };
      const invocation = lsTool.build(params);
      const description = invocation.getDescription();
      const expected = path.relative(tempRootDir, params.path);
      expect(description).toBe(expected);
    });
  });

  describe('workspace boundary validation', () => {
    it('should accept paths in primary workspace directory', async () => {
      const testPath = path.join(tempRootDir, 'src');
      await fs.mkdir(testPath);
      const params = { path: testPath };
      expect(lsTool.build(params)).toBeDefined();
    });

    it('should accept paths in secondary workspace directory', async () => {
      const testPath = path.join(tempSecondaryDir, 'lib');
      await fs.mkdir(testPath);
      const params = { path: testPath };
      expect(lsTool.build(params)).toBeDefined();
    });

    it('should reject paths outside all workspace directories', () => {
      const params = { path: '/etc/passwd' };
      expect(() => lsTool.build(params)).toThrow(
        'Path must be within one of the workspace directories',
      );
    });

    it('should list files from secondary workspace directory', async () => {
      await fs.writeFile(
        path.join(tempSecondaryDir, 'secondary-file.txt'),
        'secondary',
      );

      const invocation = lsTool.build({ path: tempSecondaryDir });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('secondary-file.txt');
      expect(result.returnDisplay).toBe('Listed 1 item(s).');
    });
  });
});
