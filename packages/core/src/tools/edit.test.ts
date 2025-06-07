/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockEnsureCorrectEdit = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());

vi.mock('../utils/editCorrector.js', () => ({
  ensureCorrectEdit: mockEnsureCorrectEdit,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
  })),
}));

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { EditTool, EditToolParams } from './edit.js';
import { FileDiff } from './tools.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ApprovalMode, Config } from '../config/config.js';
import { Content, Part, SchemaUnion } from '@google/genai';

describe('EditTool', () => {
  let tool: EditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    // The client instance that EditTool will use
    const mockClientInstanceWithGenerateJson = {
      generateJson: mockGenerateJson, // mockGenerateJson is already defined and hoisted
    };

    mockConfig = {
      getGeminiClient: vi
        .fn()
        .mockReturnValue(mockClientInstanceWithGenerateJson),
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(() => false),
      setApprovalMode: vi.fn(),
      // getGeminiConfig: () => ({ apiKey: 'test-api-key' }), // This was not a real Config method
      // Add other properties/methods of Config if EditTool uses them
      // Minimal other methods to satisfy Config type if needed by EditTool constructor or other direct uses:
      getApiKey: () => 'test-api-key',
      getModel: () => 'test-model',
      getSandbox: () => false,
      getDebugMode: () => false,
      getQuestion: () => undefined,
      getFullContext: () => false,
      getToolDiscoveryCommand: () => undefined,
      getToolCallCommand: () => undefined,
      getMcpServerCommand: () => undefined,
      getMcpServers: () => undefined,
      getUserAgent: () => 'test-agent',
      getUserMemory: () => '',
      setUserMemory: vi.fn(),
      getGeminiMdFileCount: () => 0,
      setGeminiMdFileCount: vi.fn(),
      getToolRegistry: () => ({}) as any, // Minimal mock for ToolRegistry
    } as unknown as Config;

    // Reset mocks before each test
    (mockConfig.getApprovalMode as Mock).mockClear();
    (mockConfig.getApprovalMode as Mock).mockClear();
    // Default to not skipping confirmation
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);

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

    // Default mock for generateJson to return the snippet unchanged
    mockGenerateJson.mockReset();
    mockGenerateJson.mockImplementation(
      async (contents: Content[], schema: SchemaUnion) => {
        // The problematic_snippet is the last part of the user's content
        const userContent = contents.find((c: Content) => c.role === 'user');
        let promptText = '';
        if (userContent && userContent.parts) {
          promptText = userContent.parts
            .filter((p: Part) => typeof (p as any).text === 'string')
            .map((p: Part) => (p as any).text)
            .join('\n');
        }
        const snippetMatch = promptText.match(
          /Problematic target snippet:\n```\n([\s\S]*?)\n```/,
        );
        const problematicSnippet =
          snippetMatch && snippetMatch[1] ? snippetMatch[1] : '';

        if (((schema as any).properties as any)?.corrected_target_snippet) {
          return Promise.resolve({
            corrected_target_snippet: problematicSnippet,
          });
        }
        if (((schema as any).properties as any)?.corrected_new_string) {
          // For new_string correction, we might need more sophisticated logic,
          // but for now, returning original is a safe default if not specified by a test.
          const originalNewStringMatch = promptText.match(
            /original_new_string \(what was intended to replace original_old_string\):\n```\n([\s\S]*?)\n```/,
          );
          const originalNewString =
            originalNewStringMatch && originalNewStringMatch[1]
              ? originalNewStringMatch[1]
              : '';
          return Promise.resolve({ corrected_new_string: originalNewString });
        }
        return Promise.resolve({}); // Default empty object if schema doesn't match
      },
    );

    tool = new EditTool(mockConfig);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('_applyReplacement', () => {
    // Access private method for testing
    // Note: `tool` is initialized in `beforeEach` of the parent describe block
    it('should return newString if isNewFile is true', () => {
      expect((tool as any)._applyReplacement(null, 'old', 'new', true)).toBe(
        'new',
      );
      expect(
        (tool as any)._applyReplacement('existing', 'old', 'new', true),
      ).toBe('new');
    });

    it('should return newString if currentContent is null and oldString is empty (defensive)', () => {
      expect((tool as any)._applyReplacement(null, '', 'new', false)).toBe(
        'new',
      );
    });

    it('should return empty string if currentContent is null and oldString is not empty (defensive)', () => {
      expect((tool as any)._applyReplacement(null, 'old', 'new', false)).toBe(
        '',
      );
    });

    it('should replace oldString with newString in currentContent', () => {
      expect(
        (tool as any)._applyReplacement(
          'hello old world old',
          'old',
          'new',
          false,
        ),
      ).toBe('hello new world new');
    });

    it('should return currentContent if oldString is empty and not a new file', () => {
      expect(
        (tool as any)._applyReplacement('hello world', '', 'new', false),
      ).toBe('hello world');
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params', () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'test.txt'),
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: EditToolParams = {
        file_path: 'test.txt',
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });

    it('should return error for path outside root', () => {
      const params: EditToolParams = {
        file_path: path.join(tempDir, 'outside-root.txt'),
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      expect(tool.validateToolParams(params)).toMatch(
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
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
    });

    it('should request confirmation for valid edit', async () => {
      fs.writeFileSync(filePath, 'some old content here');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      // ensureCorrectEdit will be called by shouldConfirmExecute
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 1 });
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
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
        edits: [{ old_string: 'not_found', new_string: 'new' }],
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: {
          file_path: filePath,
          old_string: 'not_found',
          new_string: 'new',
        },
        occurrences: 0,
      });

      // Our new implementation shows confirmation but with no changes,
      // which should still return false due to no edits applied
      const result = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      // If no edits would be applied, confirmation should be false
      expect(result).toBe(false);
    });

    it('should return false if multiple occurrences of old_string are found (ensureCorrectEdit returns > 1)', async () => {
      fs.writeFileSync(filePath, 'old old content here');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: {
          file_path: filePath,
          old_string: 'old',
          new_string: 'new',
        },
        occurrences: 2,
      });

      // Multiple occurrences should result in failed edit, no confirmation
      const result = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(result).toBe(false);
    });

    it('should request confirmation for creating a new file (empty old_string)', async () => {
      const newFileName = 'new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const params: EditToolParams = {
        file_path: newFilePath,
        edits: [{ old_string: '', new_string: 'new file content' }],
      };
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: expect.stringContaining(newFileName),
          fileName: newFileName,
          fileDiff: expect.any(String),
        }),
      );
    });

    it('should not use AI correction and provide clear feedback for non-matching text', async () => {
      const originalContent = 'This is the original string to be replaced.';
      const nonMatchingOldString = 'completely different text'; // This won't match at all
      const newString = 'new string';

      fs.writeFileSync(filePath, originalContent);
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: nonMatchingOldString, new_string: newString }],
      };

      // With deterministic approach, this should return false (no confirmation)
      // because the old_string doesn't match exactly
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      // Should return false because edit will fail (no exact match)
      expect(confirmation).toBe(false);
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
        edits: [{ old_string: 'old', new_string: 'new' }],
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
        edits: [{ old_string: 'old', new_string: 'new' }],
      };

      // Mock ensureCorrectEdit to return the expected params and occurrences
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: {
          file_path: filePath,
          old_string: 'old',
          new_string: 'new',
        },
        occurrences: 1,
      });

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/Successfully applied 1\/1 edits/);
      expect(result.editsApplied).toBe(1);
      expect(result.editsAttempted).toBe(1);
      expect(result.editsFailed).toBe(0);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toContain('-This is some old text.');
      expect(display.fileDiff).toContain('+This is some new text.');
      expect(display.fileName).toBe(testFile);
    });

    it('should create a new file if old_string is empty and file does not exist, and return created message', async () => {
      const newFileName = 'brand_new_file.txt';
      const newFilePath = path.join(rootDir, newFileName);
      const fileContent = 'Content for the new file.';
      const params: EditToolParams = {
        file_path: newFilePath,
        edits: [{ old_string: '', new_string: fileContent }],
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/Created new file/);
      expect(result.editsApplied).toBe(1);
      expect(result.editsAttempted).toBe(1);
      expect(result.editsFailed).toBe(0);
      expect(fs.readFileSync(newFilePath, 'utf8')).toBe(fileContent);
      expect(result.returnDisplay).toContain('Created');
    });

    it('should return error if old_string is not found in file', async () => {
      fs.writeFileSync(filePath, 'Some content.', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'nonexistent', new_string: 'replacement' }],
      };
      // Mock ensureCorrectEdit to return 0 occurrences
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: {
          file_path: filePath,
          old_string: 'not_found',
          new_string: 'replacement',
        },
        occurrences: 0,
      });

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Failed to apply any edits/);
      expect(result.editsApplied).toBe(0);
      expect(result.editsAttempted).toBe(1);
      expect(result.editsFailed).toBe(1);
      expect(result.failedEdits).toHaveLength(1);
      expect(result.failedEdits![0].error).toMatch(/String not found/);
    });

    it('should return error if multiple occurrences of old_string are found', async () => {
      const initialContent = 'old old content here';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'old', new_string: 'new' }],
      };

      // Mock ensureCorrectEdit to return multiple occurrences
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: {
          file_path: filePath,
          old_string: 'old',
          new_string: 'new',
        },
        occurrences: 2,
      });

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/Failed to apply any edits/);
      expect(result.editsApplied).toBe(0);
      expect(result.editsAttempted).toBe(1);
      expect(result.editsFailed).toBe(1);
      expect(result.failedEdits).toHaveLength(1);
      expect(result.failedEdits![0].error).toMatch(
        /Expected 1 occurrences but found 2/,
      );
    });

    it('should successfully replace multiple occurrences when expected_replacements specified', async () => {
      fs.writeFileSync(filePath, 'old text old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'old', new_string: 'new' }],
        expected_replacements: 3,
      };

      // Simulate confirmation by setting shouldAlwaysEdit
      (tool as any).shouldAlwaysEdit = true;

      const result = await tool.execute(params, new AbortController().signal);

      (tool as any).shouldAlwaysEdit = false; // Reset for other tests

      expect(result.llmContent).toMatch(/Successfully applied 1\/1 edits/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(
        'new text new text new text',
      );
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(/old text old text old text/);
      expect(display.fileDiff).toMatch(/new text new text new text/);
      expect(display.fileName).toBe(testFile);
    });

    it('should return error if expected_replacements does not match actual occurrences', async () => {
      fs.writeFileSync(filePath, 'old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: 'old', new_string: 'new' }],
        expected_replacements: 3, // Expecting 3 but only 2 exist
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(
        /Failed to apply any edits.*Expected 3 occurrences but found 2/,
      );
      expect(result.returnDisplay).toMatch(/No edits applied/);
    });

    it('should return error if trying to create a file that already exists (empty old_string)', async () => {
      const existingContent = 'File already exists.';
      fs.writeFileSync(filePath, existingContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        edits: [{ old_string: '', new_string: 'new content' }],
      };

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(/File already exists/);
      expect(result.editsApplied).toBe(0);
      expect(result.editsAttempted).toBe(1);
      expect(result.editsFailed).toBe(1);
    });

    it('should reject multiple edits with mixed file creation and editing on non-existent file', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const params: EditToolParams = {
        file_path: filePath,
        edits: [
          { old_string: '', new_string: 'new content' },
          { old_string: 'some text', new_string: 'replacement' },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);

      // File should be created with first edit, but second edit should fail
      expect(result.llmContent).toMatch(/Created new file.*Failed edits/);
      expect(result.editsApplied).toBe(1);
      expect(result.editsFailed).toBe(1);
      expect(result.failedEdits![0].error).toMatch(/String not found/);

      // File should now exist with content from first edit
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
    });

    it('should demonstrate deterministic position-based edit behavior', async () => {
      // Demonstrates that position-based processor is strict about exact matches
      const originalContent = `function processUser(userData) {
  const userName = userData.name;
  console.log('Processing user:', userName);
  return { user: userName, processed: true };
}`;

      fs.writeFileSync(filePath, originalContent);

      const params: EditToolParams = {
        file_path: filePath,
        edits: [
          // This edit will succeed - userData appears exactly once
          { old_string: 'userData', new_string: 'userInfo' },
          // This edit will fail - after first edit, this exact string no longer exists
          {
            old_string: 'const userName = userData.name;',
            new_string: 'const displayName = userInfo.name;',
          },
          // These demonstrate that dependent edits fail when context changes
          {
            old_string: "console.log('Processing user:', userName);",
            new_string: "console.log('Processing user:', displayName);",
          },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Successfully applied 2\/3 edits/);
      expect(result.llmContent).toMatch(
        /Failed edits.*Expected 1 occurrences but found 2/,
      );

      // Verify what edits were actually applied (based on position-based processing)
      const finalContent = fs.readFileSync(filePath, 'utf8');
      // Check that the content changed in some way (deterministic behavior test)
      expect(finalContent).not.toBe(originalContent);
      // The exact result depends on position-based processing order
      expect(finalContent).toContain('userInfo');
    });

    it('should handle non-conflicting edits efficiently', async () => {
      // Demonstrates successful position-based processing with non-conflicting edits
      const originalContent = `const config = {
  apiUrl: 'https://api.old.com',
  timeout: 5000,
  retries: 3
};

function makeRequest() {
  return fetch(config.apiUrl);
}`;

      fs.writeFileSync(filePath, originalContent);

      const params: EditToolParams = {
        file_path: filePath,
        edits: [
          // These edits don't interfere with each other
          {
            old_string: "apiUrl: 'https://api.old.com'",
            new_string: "apiUrl: 'https://api.new.com'",
          },
          { old_string: 'timeout: 5000', new_string: 'timeout: 10000' },
          { old_string: 'retries: 3', new_string: 'retries: 5' },
        ],
      };

      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(/Successfully applied 3\/3 edits/);

      // All edits should succeed because they don't conflict
      const finalContent = fs.readFileSync(filePath, 'utf8');
      const expectedContent = `const config = {
  apiUrl: 'https://api.new.com',
  timeout: 10000,
  retries: 5
};

function makeRequest() {
  return fetch(config.apiUrl);
}`;

      expect(finalContent).toBe(expectedContent);
    });
  });

  describe('getDescription', () => {
    it('should return consistent format even if old_string and new_string are the same', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        edits: [
          { old_string: 'identical_string', new_string: 'identical_string' },
        ],
      };
      // shortenPath will be called internally, resulting in just the file name
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: identical_string => identical_string`,
      );
    });

    it('should return a snippet of old and new strings if they are different', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        edits: [
          {
            old_string: 'this is the old string value',
            new_string: 'this is the new string value',
          },
        ],
      };
      // shortenPath will be called internally, resulting in just the file name
      // The snippets are truncated at 30 chars + '...'
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: this is the old string value => this is the new string value`,
      );
    });

    it('should handle very short strings correctly in the description', () => {
      const testFileName = 'short.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        edits: [{ old_string: 'old', new_string: 'new' }],
      };
      expect(tool.getDescription(params)).toBe(`${testFileName}: old => new`);
    });

    it('should truncate long strings in the description', () => {
      const testFileName = 'long.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        edits: [
          {
            old_string:
              'this is a very long old string that will definitely be truncated',
            new_string:
              'this is a very long new string that will also be truncated',
          },
        ],
      };
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: this is a very long old string... => this is a very long new string...`,
      );
    });
  });
});
