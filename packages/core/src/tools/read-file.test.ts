/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReadFileToolParams } from './read-file.js';
import { ReadFileTool } from './read-file.js';
import { ToolErrorType } from './tool-error.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import type { ToolInvocation, ToolResult } from './tools.js';

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

describe('ReadFileTool', () => {
  let tempRootDir: string;
  let tool: ReadFileTool;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    // Create a unique temporary root directory for each test run
    tempRootDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getFileSystemService: () => new StandardFileSystemService(),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      storage: {
        getProjectTempDir: () => path.join(tempRootDir, '.temp'),
      },
    } as unknown as Config;
    tool = new ReadFileTool(mockConfigInstance);
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  describe('build', () => {
    it('should return an invocation for valid params (absolute path within root)', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
      };
      const result = tool.build(params);
      expect(typeof result).not.toBe('string');
    });

    it('should throw error if file path is relative', () => {
      const params: ReadFileToolParams = {
        absolute_path: 'relative/path.txt',
      };
      expect(() => tool.build(params)).toThrow(
        'File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
      );
    });

    it('should throw error if path is outside root', () => {
      const params: ReadFileToolParams = {
        absolute_path: '/outside/root.txt',
      };
      expect(() => tool.build(params)).toThrow(
        /File path must be within one of the workspace directories/,
      );
    });

    it('should allow access to files in project temp directory', () => {
      const tempDir = path.join(tempRootDir, '.temp');
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempDir, 'temp-file.txt'),
      };
      const result = tool.build(params);
      expect(typeof result).not.toBe('string');
    });

    it('should show temp directory in error message when path is outside workspace and temp dir', () => {
      const params: ReadFileToolParams = {
        absolute_path: '/completely/outside/path.txt',
      };
      expect(() => tool.build(params)).toThrow(
        /File path must be within one of the workspace directories.*or within the project temp directory/,
      );
    });

    it('should throw error if path is empty', () => {
      const params: ReadFileToolParams = {
        absolute_path: '',
      };
      expect(() => tool.build(params)).toThrow(
        /The 'absolute_path' parameter must be non-empty./,
      );
    });

    it('should throw error if offset is negative', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: -1,
      };
      expect(() => tool.build(params)).toThrow(
        'Offset must be a non-negative number',
      );
    });

    it('should throw error if limit is zero or negative', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        limit: 0,
      };
      expect(() => tool.build(params)).toThrow(
        'Limit must be a positive number',
      );
    });
  });

  describe('getDescription', () => {
    it('should return relative path without limit/offset', () => {
      const subDir = path.join(tempRootDir, 'sub', 'dir');
      const params: ReadFileToolParams = {
        absolute_path: path.join(subDir, 'file.txt'),
      };
      const invocation = tool.build(params);
      expect(typeof invocation).not.toBe('string');
      expect(
        (
          invocation as ToolInvocation<ReadFileToolParams, ToolResult>
        ).getDescription(),
      ).toBe(path.join('sub', 'dir', 'file.txt'));
    });

    it('should return shortened path when file path is deep', () => {
      const deepPath = path.join(
        tempRootDir,
        'very',
        'deep',
        'directory',
        'structure',
        'that',
        'exceeds',
        'the',
        'normal',
        'limit',
        'file.txt',
      );
      const params: ReadFileToolParams = { absolute_path: deepPath };
      const invocation = tool.build(params);
      expect(typeof invocation).not.toBe('string');
      const desc = (
        invocation as ToolInvocation<ReadFileToolParams, ToolResult>
      ).getDescription();
      expect(desc).toContain('...');
      expect(desc).toContain('file.txt');
    });

    it('should handle non-normalized file paths correctly', () => {
      const subDir = path.join(tempRootDir, 'sub', 'dir');
      const params: ReadFileToolParams = {
        absolute_path: path.join(subDir, '..', 'dir', 'file.txt'),
      };
      const invocation = tool.build(params);
      expect(typeof invocation).not.toBe('string');
      expect(
        (
          invocation as ToolInvocation<ReadFileToolParams, ToolResult>
        ).getDescription(),
      ).toBe(path.join('sub', 'dir', 'file.txt'));
    });

    it('should return . if path is the root directory', () => {
      const params: ReadFileToolParams = { absolute_path: tempRootDir };
      const invocation = tool.build(params);
      expect(typeof invocation).not.toBe('string');
      expect(
        (
          invocation as ToolInvocation<ReadFileToolParams, ToolResult>
        ).getDescription(),
      ).toBe('.');
    });
  });

  describe('execute', () => {
    it('should return error if file does not exist', async () => {
      const filePath = path.join(tempRootDir, 'nonexistent.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result).toEqual({
        llmContent:
          'Could not read file because no file was found at the specified path.',
        returnDisplay: 'File not found.',
        error: {
          message: `File not found: ${filePath}`,
          type: ToolErrorType.FILE_NOT_FOUND,
        },
      });
    });

    it('should return success result for a text file', async () => {
      const filePath = path.join(tempRootDir, 'textfile.txt');
      const fileContent = 'This is a test file.';
      await fsp.writeFile(filePath, fileContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      expect(await invocation.execute(abortSignal)).toEqual({
        llmContent: fileContent,
        returnDisplay: '',
      });
    });

    it('should return error if path is a directory', async () => {
      const dirPath = path.join(tempRootDir, 'directory');
      await fsp.mkdir(dirPath);
      const params: ReadFileToolParams = { absolute_path: dirPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result).toEqual({
        llmContent:
          'Could not read file because the provided path is a directory, not a file.',
        returnDisplay: 'Path is a directory.',
        error: {
          message: `Path is a directory, not a file: ${dirPath}`,
          type: ToolErrorType.TARGET_IS_DIRECTORY,
        },
      });
    });

    it('should return error for a file that is too large', async () => {
      const filePath = path.join(tempRootDir, 'largefile.txt');
      // 21MB of content exceeds 20MB limit
      const largeContent = 'x'.repeat(21 * 1024 * 1024);
      await fsp.writeFile(filePath, largeContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result).toHaveProperty('error');
      expect(result.error?.type).toBe(ToolErrorType.FILE_TOO_LARGE);
      expect(result.error?.message).toContain(
        'File size exceeds the 20MB limit',
      );
    });

    it('should handle text file with lines exceeding maximum length', async () => {
      const filePath = path.join(tempRootDir, 'longlines.txt');
      const longLine = 'a'.repeat(2500); // Exceeds MAX_LINE_LENGTH_TEXT_FILE (2000)
      const fileContent = `Short line\n${longLine}\nAnother short line`;
      await fsp.writeFile(filePath, fileContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'IMPORTANT: The file content has been truncated',
      );
      expect(result.llmContent).toContain('--- FILE CONTENT (truncated) ---');
      expect(result.returnDisplay).toContain('some lines were shortened');
    });

    it('should handle image file and return appropriate content', async () => {
      const imagePath = path.join(tempRootDir, 'image.png');
      // Minimal PNG header
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      await fsp.writeFile(imagePath, pngHeader);
      const params: ReadFileToolParams = { absolute_path: imagePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toEqual({
        inlineData: {
          data: pngHeader.toString('base64'),
          mimeType: 'image/png',
        },
      });
      expect(result.returnDisplay).toBe('Read image file: image.png');
    });

    it('should handle PDF file and return appropriate content', async () => {
      const pdfPath = path.join(tempRootDir, 'document.pdf');
      // Minimal PDF header
      const pdfHeader = Buffer.from('%PDF-1.4');
      await fsp.writeFile(pdfPath, pdfHeader);
      const params: ReadFileToolParams = { absolute_path: pdfPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toEqual({
        inlineData: {
          data: pdfHeader.toString('base64'),
          mimeType: 'application/pdf',
        },
      });
      expect(result.returnDisplay).toBe('Read pdf file: document.pdf');
    });

    it('should handle binary file and skip content', async () => {
      const binPath = path.join(tempRootDir, 'binary.bin');
      // Binary data with null bytes
      const binaryData = Buffer.from([0x00, 0xff, 0x00, 0xff]);
      await fsp.writeFile(binPath, binaryData);
      const params: ReadFileToolParams = { absolute_path: binPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toBe(
        'Cannot display content of binary file: binary.bin',
      );
      expect(result.returnDisplay).toBe('Skipped binary file: binary.bin');
    });

    it('should handle SVG file as text', async () => {
      const svgPath = path.join(tempRootDir, 'image.svg');
      const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
      await fsp.writeFile(svgPath, svgContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: svgPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toBe(svgContent);
      expect(result.returnDisplay).toBe('Read SVG as text: image.svg');
    });

    it('should handle large SVG file', async () => {
      const svgPath = path.join(tempRootDir, 'large.svg');
      // Create SVG content larger than 1MB
      const largeContent = '<svg>' + 'x'.repeat(1024 * 1024 + 1) + '</svg>';
      await fsp.writeFile(svgPath, largeContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: svgPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toBe(
        'Cannot display content of SVG file larger than 1MB: large.svg',
      );
      expect(result.returnDisplay).toBe(
        'Skipped large SVG file (>1MB): large.svg',
      );
    });

    it('should handle empty file', async () => {
      const emptyPath = path.join(tempRootDir, 'empty.txt');
      await fsp.writeFile(emptyPath, '', 'utf-8');
      const params: ReadFileToolParams = { absolute_path: emptyPath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toBe('');
      expect(result.returnDisplay).toBe('');
    });

    it('should support offset and limit for text files', async () => {
      const filePath = path.join(tempRootDir, 'paginated.txt');
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      await fsp.writeFile(filePath, fileContent, 'utf-8');

      const params: ReadFileToolParams = {
        absolute_path: filePath,
        offset: 5, // Start from line 6
        limit: 3,
      };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'IMPORTANT: The file content has been truncated',
      );
      expect(result.llmContent).toContain(
        'Status: Showing lines 6-8 of 20 total lines',
      );
      expect(result.llmContent).toContain('Line 6');
      expect(result.llmContent).toContain('Line 7');
      expect(result.llmContent).toContain('Line 8');
      expect(result.returnDisplay).toBe(
        'Read lines 6-8 of 20 from paginated.txt',
      );
    });

    it('should successfully read files from project temp directory', async () => {
      const tempDir = path.join(tempRootDir, '.temp');
      await fsp.mkdir(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, 'temp-output.txt');
      const tempFileContent = 'This is temporary output content';
      await fsp.writeFile(tempFilePath, tempFileContent, 'utf-8');

      const params: ReadFileToolParams = { absolute_path: tempFilePath };
      const invocation = tool.build(params) as ToolInvocation<
        ReadFileToolParams,
        ToolResult
      >;

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toBe(tempFileContent);
      expect(result.returnDisplay).toBe('');
    });

    describe('with .geminiignore', () => {
      beforeEach(async () => {
        await fsp.writeFile(
          path.join(tempRootDir, '.geminiignore'),
          ['foo.*', 'ignored/'].join('\n'),
        );
      });

      it('should throw error if path is ignored by a .geminiignore pattern', async () => {
        const ignoredFilePath = path.join(tempRootDir, 'foo.bar');
        await fsp.writeFile(ignoredFilePath, 'content', 'utf-8');
        const params: ReadFileToolParams = {
          absolute_path: ignoredFilePath,
        };
        const expectedError = `File path '${ignoredFilePath}' is ignored by .geminiignore pattern(s).`;
        expect(() => tool.build(params)).toThrow(expectedError);
      });

      it('should throw error if file is in an ignored directory', async () => {
        const ignoredDirPath = path.join(tempRootDir, 'ignored');
        await fsp.mkdir(ignoredDirPath, { recursive: true });
        const ignoredFilePath = path.join(ignoredDirPath, 'file.txt');
        await fsp.writeFile(ignoredFilePath, 'content', 'utf-8');
        const params: ReadFileToolParams = {
          absolute_path: ignoredFilePath,
        };
        const expectedError = `File path '${ignoredFilePath}' is ignored by .geminiignore pattern(s).`;
        expect(() => tool.build(params)).toThrow(expectedError);
      });

      it('should allow reading non-ignored files', async () => {
        const allowedFilePath = path.join(tempRootDir, 'allowed.txt');
        await fsp.writeFile(allowedFilePath, 'content', 'utf-8');
        const params: ReadFileToolParams = {
          absolute_path: allowedFilePath,
        };
        const invocation = tool.build(params);
        expect(typeof invocation).not.toBe('string');
      });
    });
  });
});
