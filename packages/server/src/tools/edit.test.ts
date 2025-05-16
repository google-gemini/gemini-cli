/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditTool, EditToolParams } from './edit.js';
import { FileDiff } from './tools.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Config } from '../config/config.js';

// Mock GeminiClient
const mockEnsureCorrectEdit = vi.fn();
vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    // This is the method called by EditTool
    ensureCorrectEdit: mockEnsureCorrectEdit,
  })),
}));

describe('EditTool', () => {
  let tool: EditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    mockConfig = {
      getTargetDir: () => rootDir,
      getGeminiConfig: () => ({ apiKey: 'test-api-key' }),
      // Add other properties/methods of Config if EditTool uses them
    } as unknown as Config;

    // Reset mocks and set default implementation for ensureCorrectEdit
    mockEnsureCorrectEdit.mockReset();
    mockEnsureCorrectEdit.mockImplementation(async (currentContent, params) => {
      let occurrences = 0;
      if (params.old_string && currentContent) {
        // Simple string counting for the mock
        let index = currentContent.indexOf(params.old_string);
        while (index !== -1) {
          occurrences++;
          index = currentContent.indexOf(params.old_string, index + 1);
        }
      } else if (params.old_string === '') {
        occurrences = 0; // Creating a new file
      }
      return Promise.resolve({ params, occurrences });
    });

    tool = new EditTool(mockConfig); // GeminiClient is mocked via vi.mock
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    // vi.clearAllMocks(); // This might be too broad if other tests need persistent mocks
  });

  describe('validateParams', () => {
    it('should return null for valid params', () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'test.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: EditToolParams = {
        file_path: 'test.txt',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateParams(params)).toMatch(/File path must be absolute/);
    });

    it('should return error for path outside root', () => {
      const params: EditToolParams = {
        file_path: path.join(tempDir, 'outside-root.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateParams(params)).toMatch(
        /File path must be within the root directory/,
      );
    });
  });

  describe('shouldConfirmExecute', () => {
    const testFile = 'edit_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('should return false if params are invalid', async () => {
      const params: EditToolParams = {
        file_path: 'relative.txt',
        old_string: 'old',
        new_string: 'new',
      };
      expect(await tool.shouldConfirmExecute(params)).toBe(false);
    });

    it('should request confirmation for valid edit', async () => {
      fs.writeFileSync(filePath, 'some old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      // ensureCorrectEdit will be called by shouldConfirmExecute
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 1 });
      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${testFile}`,
          fileName: testFile,
          fileDiff: expect.any(String),
        }),
      );
    });

    it('should return false if old_string is not found (ensureCorrectEdit returns 0)', async () => {
      fs.writeFileSync(filePath, 'some content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'not_found',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 0 });
      expect(await tool.shouldConfirmExecute(params)).toBe(false);
    });

    it('should return false if multiple occurrences of old_string are found (ensureCorrectEdit returns > 1)', async () => {
      fs.writeFileSync(filePath, 'old old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 2 });
      expect(await tool.shouldConfirmExecute(params)).toBe(false);
    });

    it('should request confirmation for creating a new file (empty old_string)', async () => {
      const newFileName = 'new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const params: EditToolParams = {
        file_path: newFilePath,
        old_string: '',
        new_string: 'new file content',
      };
      // ensureCorrectEdit might not be called if old_string is empty,
      // as shouldConfirmExecute handles this for diff generation.
      // If it is called, it should return 0 occurrences for a new file.
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 0 });
      const confirmation = await tool.shouldConfirmExecute(params);
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${newFileName}`,
          fileName: newFileName,
          fileDiff: expect.any(String),
        }),
      );
    });
  });

  describe('execute', () => {
    const testFile = 'execute_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
      // Default for execute tests, can be overridden
      mockEnsureCorrectEdit.mockImplementation(async (content, params) => {
        let occurrences = 0;
        if (params.old_string && content) {
          let index = content.indexOf(params.old_string);
          while (index !== -1) {
            occurrences++;
            index = content.indexOf(params.old_string, index + 1);
          }
        } else if (params.old_string === '') {
          occurrences = 0;
        }
        return { params, occurrences };
      });
    });

    it('should return error if params are invalid', async () => {
      const params: EditToolParams = {
        file_path: 'relative.txt',
        old_string: 'old',
        new_string: 'new',
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/Error: File path must be absolute/);
    });

    it('should edit an existing file and return diff with fileName', async () => {
      const initialContent = 'This is some old text.';
      const newContent = 'This is some new text.'; // old -> new
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };

      // Specific mock for this test's execution path in calculateEdit
      // ensureCorrectEdit is NOT called by calculateEdit, only by shouldConfirmExecute
      // So, the default mockEnsureCorrectEdit should correctly return 1 occurrence for 'old' in initialContent

      // Simulate confirmation by setting shouldAlwaysEdit
      (tool as any).shouldAlwaysEdit = true;

      const result = await tool.execute(params, new AbortController().signal);

      (tool as any).shouldAlwaysEdit = false; // Reset for other tests

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(initialContent);
      expect(display.fileDiff).toMatch(newContent);
      expect(display.fileName).toBe(testFile);
    });

    it('should create a new file if old_string is empty and file does not exist, and return created message', async () => {
      const newFileName = 'brand_new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const fileContent = 'Content for the new file.';
      const params: EditToolParams = {
        file_path: newFilePath,
        old_string: '',
        new_string: fileContent,
      };

      (tool as any).shouldAlwaysEdit = true;
      const result = await tool.execute(params, new AbortController().signal);
      (tool as any).shouldAlwaysEdit = false;

      expect(result.llmContent).toMatch(/Created new file/);
      expect(fs.existsSync(newFilePath)).toBe(true);
      expect(fs.readFileSync(newFilePath, 'utf8')).toBe(fileContent);
      expect(result.returnDisplay).toBe(`Created ${newFileName}`);
    });

    it('should return error if old_string is not found in file', async () => {
      fs.writeFileSync(filePath, 'Some content.', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'nonexistent',
        new_string: 'replacement',
      };
      // The default mockEnsureCorrectEdit will return 0 occurrences for 'nonexistent'
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/0 occurrences found/);
      expect(result.returnDisplay).toMatch(
        /Failed to edit, could not find the string to replace/,
      );
    });

    it('should return error if multiple occurrences of old_string are found', async () => {
      fs.writeFileSync(filePath, 'multiple old old strings', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      // The default mockEnsureCorrectEdit will return 2 occurrences for 'old'
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Expected 1 occurrences but found 2/);
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 1 occurrence\(s\) but found 2/,
      );
    });

    it('should return error if trying to create a file that already exists (empty old_string)', async () => {
      fs.writeFileSync(filePath, 'Existing content', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: '',
        new_string: 'new content',
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/File already exists, cannot create/);
      expect(result.returnDisplay).toMatch(
        /Attempted to create a file that already exists/,
      );
    });
  });
});
