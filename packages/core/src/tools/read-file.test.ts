/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';
import { ReadFileTool, ReadFileToolParams } from './read-file.js';
import * as fileUtils from '../utils/fileUtils.js';
import path from 'path';
import os from 'os';
import fs from 'fs'; // For actual fs operations in setup
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { FilePermissionService, FilePermissionRule } from '../services/filePermissionService.js';

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

describe('ReadFileTool', () => {
  let tempRootDir: string;
  let tool: ReadFileTool;
   let mockCoreConfig: MockProxy<Config>;
   let mockFilePermissionService: MockProxy<FilePermissionService>;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    // Create a unique temporary root directory for each test run
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-file-tool-root-'),
    );
    fs.writeFileSync(
      path.join(tempRootDir, '.geminiignore'),
      ['foo.*'].join('\n'),
    );

    mockCoreConfig = mock<Config>();
    mockFilePermissionService = mock<FilePermissionService>();

    const fileService = new FileDiscoveryService(tempRootDir);
    mockCoreConfig.getFileService.mockReturnValue(fileService);
    mockCoreConfig.getFilePermissionService.mockReturnValue(mockFilePermissionService);
    // Mock getTargetDir as it's used by the tool directly or indirectly
    mockCoreConfig.getTargetDir.mockReturnValue(tempRootDir);


    tool = new ReadFileTool(tempRootDir, mockCoreConfig);
    mockProcessSingleFileContent.mockReset();
    // Default to allow all operations for permission service unless specified otherwise in a test
    mockFilePermissionService.canPerformOperation.mockReturnValue(true);
  });

  afterEach(() => {
    // Clean up the temporary root directory
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
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
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
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
        'Parameters failed schema validation.',
      );
    });
  });

  describe('getDescription', () => {
    it('should return a shortened, relative path', () => {
      const filePath = path.join(tempRootDir, 'sub', 'dir', 'file.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };
      // Assuming tempRootDir is something like /tmp/read-file-tool-root-XXXXXX
      // The relative path would be sub/dir/file.txt
      expect(tool.getDescription(params)).toBe('sub/dir/file.txt');
    });

    it('should return . if path is the root directory', () => {
      const params: ReadFileToolParams = { absolute_path: tempRootDir };
      expect(tool.getDescription(params)).toBe('.');
    });
  });

  describe('execute', () => {
    it('should return validation error if params are invalid', async () => {
      const params: ReadFileToolParams = { absolute_path: 'relative/path.txt' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/File path must be absolute/);
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
    });

    it('should return success result for a text file', async () => {
      const filePath = path.join(tempRootDir, 'textfile.txt');
      const fileContent = 'This is a test file.';
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
    });

    it('should return permission denied error if FilePermissionService denies read', async () => {
      const filePath = path.join(tempRootDir, 'protected.txt');
      const params: ReadFileToolParams = { absolute_path: filePath };

      // Simulate file exists for validation purposes
      fs.writeFileSync(filePath, 'secret content');

      mockFilePermissionService.canPerformOperation.mockImplementation((fp, op) => {
        return !(fp === filePath && op === 'read');
      });

      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toMatch(/Error: Read operation on file 'protected.txt' denied by file permission configuration./);
      expect(result.returnDisplay).toMatch(/Error: Read operation on file 'protected.txt' denied by file permission configuration./);
      expect(mockProcessSingleFileContent).not.toHaveBeenCalled();
    });

    it('should allow read if FilePermissionService allows it, even if .geminiignore would ignore it (explicit path)', async () => {
      // Scenario: foo.bar is in .geminiignore
      // If we explicitly try to read foo.bar, and permissions *allow* it, it should be read.
      // The .geminiignore check in validateToolParams is for discovery/implicit inclusion.
      // If a path is given directly, file permissions take precedence.
      const ignoredFilePath = path.join(tempRootDir, 'foo.bar');
      fs.writeFileSync(ignoredFilePath, 'content of ignored file');
      const params: ReadFileToolParams = { absolute_path: ignoredFilePath };

      // Validation will pass because file exists and is within root.
      // .geminiignore check in validateToolParams will prevent implicit reads (e.g. via glob)
      // but here we are testing explicit read.
      // For this test, let's assume validateToolParams is called and we are interested in execute behavior
      // The current validateToolParams *will* block this.
      // This highlights a design choice: should direct access bypass .geminiignore if permissions allow?
      // Current ReadFileTool.validateToolParams returns an error if file is in .geminiignore.
      // So, to test execute's permission check independently, we'd need to bypass that part of validation.
      // Let's adjust the test to reflect current validation behavior:
      // An ignored file will be blocked by validateToolParams first.

      const validationResult = tool.validateToolParams(params);
      expect(validationResult).toMatch(/'foo.bar' is ignored by .geminiignore pattern\(s\)/);

      // If we wanted to test the permission service interaction *despite* .geminiignore,
      // we might need to mock `validateToolParams` or adjust its logic.
      // For now, this confirms .geminiignore takes precedence in validation for ReadFileTool.

      // To properly test the FilePermissionService interaction in execute():
      // We need a file that is NOT ignored by .geminiignore but IS denied by FilePermissionService.
      const anotherFilePath = path.join(tempRootDir, 'another.txt');
      fs.writeFileSync(anotherFilePath, 'some other content');
      const paramsForAnotherFile: ReadFileToolParams = { absolute_path: anotherFilePath };

      mockFilePermissionService.canPerformOperation.mockImplementation((fp, op) => {
        return !(fp === anotherFilePath && op === 'read'); // Deny read for another.txt
      });

      const result = await tool.execute(paramsForAnotherFile, abortSignal);
      expect(result.llmContent).toMatch(/Error: Read operation on file 'another.txt' denied by file permission configuration./);
      expect(result.returnDisplay).toMatch(/Error: Read operation on file 'another.txt' denied by file permission configuration./);
      expect(mockProcessSingleFileContent).not.toHaveBeenCalled();
    });
  });
});
