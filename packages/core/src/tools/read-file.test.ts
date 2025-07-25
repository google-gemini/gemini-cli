/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

<<<<<<< HEAD
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { ReadFileTool, ReadFileToolParams } from './read-file.js';
import * as fileUtils from '../utils/fileUtils.js';
import path from 'path';
import os from 'os';
import fs from 'fs'; // For actual fs operations in setup
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

// Mock fileUtils.processSingleFileContent
vi.mock('../utils/fileUtils', async () => {
  const actualFileUtils =
    await vi.importActual<typeof fileUtils>('../utils/fileUtils');
  return {
    ...actualFileUtils, // Spread actual implementations
    processSingleFileContent: vi.fn(), // Mock specific function
  };
});

const mockProcessSingleFileContent = fileUtils.processSingleFileContent as Mock;

=======
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReadFileTool, ReadFileToolParams } from './read-file.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
describe('ReadFileTool', () => {
  let tempRootDir: string;
  let tool: ReadFileTool;
  const abortSignal = new AbortController().signal;

<<<<<<< HEAD
  beforeEach(() => {
    // Create a unique temporary root directory for each test run
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );
    fs.writeFileSync(
      path.join(tempRootDir, '.geminiignore'),
      ['foo.*'].join('\n'),
    );
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfigInstance = {
      getFileService: () => fileService,
      getTargetDir: () => tempRootDir,
    } as unknown as Config;
    tool = new ReadFileTool(mockConfigInstance);
    mockProcessSingleFileContent.mockReset();
  });

  afterEach(() => {
    // Clean up the temporary root directory
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
=======
  beforeEach(async () => {
    // Create a unique temporary root directory for each test run
    tempRootDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getTargetDir: () => tempRootDir,
    } as unknown as Config;
    tool = new ReadFileTool(mockConfigInstance);
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
    }
  });

  describe('validateToolParams', () => {
    it('should return null for valid params (absolute path within root)', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params with offset and limit', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: 10,
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: ReadFileToolParams = { absolute_path: 'test.txt' };
      expect(tool.validateToolParams(params)).toBe(
        `File path must be absolute, but was relative: test.txt. You must provide an absolute path.`,
      );
    });

    it('should return error for path outside root', () => {
      const outsidePath = path.resolve(os.tmpdir(), 'outside-root.txt');
      const params: ReadFileToolParams = { absolute_path: outsidePath };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be within the root directory/,
      );
    });

    it('should return error for negative offset', () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: -1,
        limit: 10,
      };
      expect(tool.validateToolParams(params)).toBe(
        'Offset must be a non-negative number',
      );
    });

    it('should return error for non-positive limit', () => {
      const paramsZero: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: 0,
      };
      expect(tool.validateToolParams(paramsZero)).toBe(
        'Limit must be a positive number',
      );
      const paramsNegative: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'test.txt'),
        offset: 0,
        limit: -5,
      };
      expect(tool.validateToolParams(paramsNegative)).toBe(
        'Limit must be a positive number',
      );
    });

    it('should return error for schema validation failure (e.g. missing path)', () => {
      const params = { offset: 0 } as unknown as ReadFileToolParams;
      expect(tool.validateToolParams(params)).toBe(
        `params must have required property 'absolute_path'`,
      );
    });
  });

  describe('getDescription', () => {
    it('should return a shortened, relative path', () => {
      const filePath = path.join(tempRootDir, 'sub', 'dir', 'file.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
<<<<<<< HEAD
      // Assuming tempRootDir is something like /tmp/read-file-tool-root-XXXXXX
      // The relative path would be sub/dir/file.txt
      expect(tool.getDescription(params)).toBe('sub/dir/file.txt');
=======
      expect(tool.getDescription(params)).toBe(
        path.join('sub', 'dir', 'file.txt'),
      );
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
    });

    it('should return . if path is the root directory', () => {
      const params: ReadFileToolParams = { absolute_path: tempRootDir };
      expect(tool.getDescription(params)).toBe('.');
    });
  });

  describe('execute', () => {
    it('should return validation error if params are invalid', async () => {
<<<<<<< HEAD
      const params: ReadFileToolParams = { absolute_path: 'relative/path.txt' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toBe(
        'Error: Invalid parameters provided. Reason: File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
      );
      expect(result.returnDisplay).toBe(
        'File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
      );
    });

    it('should return error from processSingleFileContent if it fails', async () => {
      const filePath = path.join(tempRootDir, 'error.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      const errorMessage = 'Simulated read error';
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: `Error reading file ${filePath}: ${errorMessage}`,
        returnDisplay: `Error reading file ${filePath}: ${errorMessage}`,
        error: errorMessage,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toContain(errorMessage);
      expect(result.returnDisplay).toContain(errorMessage);
=======
      const params: ReadFileToolParams = {
        absolute_path: 'relative/path.txt',
      };
      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent:
          'Error: Invalid parameters provided. Reason: File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
        returnDisplay:
          'File path must be absolute, but was relative: relative/path.txt. You must provide an absolute path.',
      });
    });

    it('should return error if file does not exist', async () => {
      const filePath = path.join(tempRootDir, 'nonexistent.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };

      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent: `File not found: ${filePath}`,
        returnDisplay: 'File not found.',
      });
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
    });

    it('should return success result for a text file', async () => {
      const filePath = path.join(tempRootDir, 'textfile.txt');
      const fileContent = 'This is a test file.';
<<<<<<< HEAD
      const params: ReadFileToolParams = { absolute_path: filePath };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: fileContent,
        returnDisplay: `Read text file: ${path.basename(filePath)}`,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toBe(fileContent);
      expect(result.returnDisplay).toBe(
        `Read text file: ${path.basename(filePath)}`,
      );
    });

    it('should return success result for an image file', async () => {
      const filePath = path.join(tempRootDir, 'image.png');
      const imageData = {
        inlineData: { mimeType: 'image/png', data: 'base64...' },
      };
      const params: ReadFileToolParams = { absolute_path: filePath };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: imageData,
        returnDisplay: `Read image file: ${path.basename(filePath)}`,
      });

      const result = await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        undefined,
        undefined,
      );
      expect(result.llmContent).toEqual(imageData);
      expect(result.returnDisplay).toBe(
        `Read image file: ${path.basename(filePath)}`,
      );
    });

    it('should pass offset and limit to processSingleFileContent', async () => {
      const filePath = path.join(tempRootDir, 'paginated.txt');
      const params: ReadFileToolParams = {
        absolute_path: filePath,
        offset: 10,
        limit: 5,
      };
      mockProcessSingleFileContent.mockResolvedValue({
        llmContent: 'some lines',
        returnDisplay: 'Read text file (paginated)',
      });

      await tool.execute(params, abortSignal);
      expect(mockProcessSingleFileContent).toHaveBeenCalledWith(
        filePath,
        tempRootDir,
        10,
        5,
      );
    });

    it('should return error if path is ignored by a .geminiignore pattern', async () => {
      const params: ReadFileToolParams = {
        absolute_path: path.join(tempRootDir, 'foo.bar'),
      };
      const result = await tool.execute(params, abortSignal);
      expect(result.returnDisplay).toContain('foo.bar');
      expect(result.returnDisplay).not.toContain('foo.baz');
=======
      await fsp.writeFile(filePath, fileContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: filePath };

      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent: fileContent,
        returnDisplay: '',
      });
    });

    it('should return success result for an image file', async () => {
      // A minimal 1x1 transparent PNG file.
      const pngContent = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
        1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65,
        84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73,
        69, 78, 68, 174, 66, 96, 130,
      ]);
      const filePath = path.join(tempRootDir, 'image.png');
      await fsp.writeFile(filePath, pngContent);
      const params: ReadFileToolParams = { absolute_path: filePath };

      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent: {
          inlineData: {
            mimeType: 'image/png',
            data: pngContent.toString('base64'),
          },
        },
        returnDisplay: `Read image file: image.png`,
      });
    });

    it('should treat a non-image file with image extension as an image', async () => {
      const filePath = path.join(tempRootDir, 'fake-image.png');
      const fileContent = 'This is not a real png.';
      await fsp.writeFile(filePath, fileContent, 'utf-8');
      const params: ReadFileToolParams = { absolute_path: filePath };

      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent: {
          inlineData: {
            mimeType: 'image/png',
            data: Buffer.from(fileContent).toString('base64'),
          },
        },
        returnDisplay: `Read image file: fake-image.png`,
      });
    });

    it('should pass offset and limit to read a slice of a text file', async () => {
      const filePath = path.join(tempRootDir, 'paginated.txt');
      const fileContent = Array.from(
        { length: 20 },
        (_, i) => `Line ${i + 1}`,
      ).join('\n');
      await fsp.writeFile(filePath, fileContent, 'utf-8');

      const params: ReadFileToolParams = {
        absolute_path: filePath,
        offset: 5, // Start from line 6
        limit: 3,
      };

      expect(await tool.execute(params, abortSignal)).toEqual({
        llmContent: [
          '[File content truncated: showing lines 6-8 of 20 total lines. Use offset/limit parameters to view more.]',
          'Line 6',
          'Line 7',
          'Line 8',
        ].join('\n'),
        returnDisplay: '(truncated)',
      });
    });

    describe('with .geminiignore', () => {
      beforeEach(async () => {
        await fsp.writeFile(
          path.join(tempRootDir, '.geminiignore'),
          ['foo.*', 'ignored/'].join('\n'),
        );
      });

      it('should return error if path is ignored by a .geminiignore pattern', async () => {
        const ignoredFilePath = path.join(tempRootDir, 'foo.bar');
        await fsp.writeFile(ignoredFilePath, 'content', 'utf-8');
        const params: ReadFileToolParams = {
          absolute_path: ignoredFilePath,
        };
        const expectedError = `File path '${ignoredFilePath}' is ignored by .geminiignore pattern(s).`;
        expect(await tool.execute(params, abortSignal)).toEqual({
          llmContent: `Error: Invalid parameters provided. Reason: ${expectedError}`,
          returnDisplay: expectedError,
        });
      });

      it('should return error if path is in an ignored directory', async () => {
        const ignoredDirPath = path.join(tempRootDir, 'ignored');
        await fsp.mkdir(ignoredDirPath);
        const filePath = path.join(ignoredDirPath, 'somefile.txt');
        await fsp.writeFile(filePath, 'content', 'utf-8');

        const params: ReadFileToolParams = {
          absolute_path: filePath,
        };
        const expectedError = `File path '${filePath}' is ignored by .geminiignore pattern(s).`;
        expect(await tool.execute(params, abortSignal)).toEqual({
          llmContent: `Error: Invalid parameters provided. Reason: ${expectedError}`,
          returnDisplay: expectedError,
        });
      });
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
    });
  });
});
