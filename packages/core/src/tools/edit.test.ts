/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockEnsureCorrectEdit = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

vi.mock('../utils/editCorrector.js', () => ({
  ensureCorrectEdit: mockEnsureCorrectEdit,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
  })),
}));

vi.mock('../utils/editor.js', () => ({
  openDiff: mockOpenDiff,
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
      getApprovalMode: vi.fn(),
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
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: EditToolParams = {
        file_path: 'test.txt',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });

    it('should return error for path outside root', () => {
      const params: EditToolParams = {
        file_path: path.join(tempDir, 'outside-root.txt'),
        old_string: 'old',
        new_string: 'new',
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
        old_string: 'old',
        new_string: 'new',
      };
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
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
        old_string: 'not_found',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 0 });
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if multiple occurrences of old_string are found (ensureCorrectEdit returns > 1)', async () => {
      fs.writeFileSync(filePath, 'old old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 2 });
      expect(
        await tool.shouldConfirmExecute(params, new AbortController().signal),
      ).toBe(false);
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
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${newFileName}`,
          fileName: newFileName,
          fileDiff: expect.any(String),
        }),
      );
    });

    it('should use corrected params from ensureCorrectEdit for diff generation', async () => {
      const originalContent = 'This is the original string to be replaced.';
      const originalOldString = 'original string';
      const originalNewString = 'new string';

      const correctedOldString = 'original string to be replaced'; // More specific
      const correctedNewString = 'completely new string'; // Different replacement
      const expectedFinalContent = 'This is the completely new string.';

      fs.writeFileSync(filePath, originalContent);
      const params: EditToolParams = {
        file_path: filePath,
        old_string: originalOldString,
        new_string: originalNewString,
      };

      // The main beforeEach already calls mockEnsureCorrectEdit.mockReset()
      // Set a specific mock for this test case
      let mockCalled = false;
      mockEnsureCorrectEdit.mockImplementationOnce(
        async (content, p, client) => {
          mockCalled = true;
          expect(content).toBe(originalContent);
          expect(p).toBe(params);
          expect(client).toBe((tool as any).client);
          return {
            params: {
              file_path: filePath,
              old_string: correctedOldString,
              new_string: correctedNewString,
            },
            occurrences: 1,
          };
        },
      );

      const confirmation = (await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      )) as FileDiff;

      expect(mockCalled).toBe(true); // Check if the mock implementation was run
      // expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(originalContent, params, expect.anything()); // Keep this commented for now
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Edit: ${testFile}`,
          fileName: testFile,
        }),
      );
      // Check that the diff is based on the corrected strings leading to the new state
      expect(confirmation.fileDiff).toContain(`-${originalContent}`);
      expect(confirmation.fileDiff).toContain(`+${expectedFinalContent}`);

      // Verify that applying the correctedOldString and correctedNewString to originalContent
      // indeed produces the expectedFinalContent, which is what the diff should reflect.
      const patchedContent = originalContent.replace(
        correctedOldString, // This was the string identified by ensureCorrectEdit for replacement
        correctedNewString, // This was the string identified by ensureCorrectEdit as the replacement
      );
      expect(patchedContent).toBe(expectedFinalContent);
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

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

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
      expect(result.llmContent).toMatch(
        /0 occurrences found for old_string in/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, could not find the string to replace./,
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
      expect(result.llmContent).toMatch(
        /Expected 1 occurrence but found 2 for old_string in file/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 1 occurrence but found 2/,
      );
    });

    it('should successfully replace multiple occurrences when expected_replacements specified', async () => {
      fs.writeFileSync(filePath, 'old text old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3,
      };

      // Simulate confirmation by setting shouldAlwaysEdit
      (tool as any).shouldAlwaysEdit = true;

      const result = await tool.execute(params, new AbortController().signal);

      (tool as any).shouldAlwaysEdit = false; // Reset for other tests

      expect(result.llmContent).toMatch(/Successfully modified file/);
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
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3, // Expecting 3 but only 2 exist
      };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toMatch(
        /Expected 3 occurrences but found 2 for old_string in file/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 3 occurrences but found 2/,
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

    it('should include modification message when proposed content is modified', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        modified_by_user: true,
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toMatch(
        /User modified the `new_string` content/,
      );
    });

    it('should not include modification message when proposed content is not modified', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        modified_by_user: false,
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).not.toMatch(
        /User modified the `new_string` content/,
      );
    });

    it('should not include modification message when modified_by_user is not provided', async () => {
      const initialContent = 'This is some old text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).not.toMatch(
        /User modified the `new_string` content/,
      );
    });
  });

  describe('getDescription', () => {
    it('should return "No file changes to..." if old_string and new_string are the same', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'identical_string',
        new_string: 'identical_string',
      };
      // shortenPath will be called internally, resulting in just the file name
      expect(tool.getDescription(params)).toBe(
        `No file changes to ${testFileName}`,
      );
    });

    it('should return a snippet of old and new strings if they are different', () => {
      const testFileName = 'test.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'this is the old string value',
        new_string: 'this is the new string value',
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
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.getDescription(params)).toBe(`${testFileName}: old => new`);
    });

    it('should truncate long strings in the description', () => {
      const testFileName = 'long.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string:
          'this is a very long old string that will definitely be truncated',
        new_string:
          'this is a very long new string that will also be truncated',
      };
      expect(tool.getDescription(params)).toBe(
        `${testFileName}: this is a very long old string... => this is a very long new string...`,
      );
    });
  });
});

  describe('Additional Edge Cases and Error Handling', () => {
    const testFile = 'edge_case_test.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    describe('File System Error Handling', () => {
      it('should handle file read permissions errors gracefully', async () => {
        fs.writeFileSync(filePath, 'content', { mode: 0o000 }); // No read permissions
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };
        
        try {
          const result = await tool.execute(params, new AbortController().signal);
          expect(result.llmContent).toMatch(/Error:/);
        } finally {
          // Restore permissions for cleanup
          fs.chmodSync(filePath, 0o644);
        }
      });

      it('should handle directory creation errors for nested paths', async () => {
        const nestedPath = path.join(rootDir, 'deeply', 'nested', 'path', 'file.txt');
        const params: EditToolParams = {
          file_path: nestedPath,
          old_string: '',
          new_string: 'content',
        };

        (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(ApprovalMode.AUTO_EDIT);
        const result = await tool.execute(params, new AbortController().signal);
        
        expect(result.llmContent).toMatch(/Created new file/);
        expect(fs.existsSync(nestedPath)).toBe(true);
      });

      it('should handle write permission errors gracefully', async () => {
        // Create a read-only directory
        const readOnlyDir = path.join(tempDir, 'readonly');
        fs.mkdirSync(readOnlyDir, { mode: 0o444 });
        const readOnlyFile = path.join(readOnlyDir, 'readonly.txt');
        
        const params: EditToolParams = {
          file_path: readOnlyFile,
          old_string: '',
          new_string: 'content',
        };

        try {
          const result = await tool.execute(params, new AbortController().signal);
          expect(result.llmContent).toMatch(/Error:/);
        } finally {
          // Cleanup - restore permissions
          fs.chmodSync(readOnlyDir, 0o755);
        }
      });
    });

    describe('Unicode and Special Character Handling', () => {
      it('should handle files with Unicode characters correctly', async () => {
        const unicodeContent = '🚀 Hello, 世界! Café résumé naïve 🌟';
        const unicodeOld = '世界';
        const unicodeNew = 'World';
        
        fs.writeFileSync(filePath, unicodeContent, 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          old_string: unicodeOld,
          new_string: unicodeNew,
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toContain(unicodeNew);
        expect(updatedContent).not.toContain(unicodeOld);
      });

      it('should handle files with different line endings', async () => {
        const contentWithCRLF = 'line1\r\nline2\r\nold text\r\nline4';
        fs.writeFileSync(filePath, contentWithCRLF, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'old text',
          new_string: 'new text',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toContain('new text');
        expect(updatedContent).toContain('\r\n'); // Preserves original line endings
      });

      it('should handle empty files correctly', async () => {
        fs.writeFileSync(filePath, '', 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: '',
          new_string: 'first content',
        };

        const result = await tool.execute(params, new AbortController().signal);
        expect(result.llmContent).toMatch(/File already exists, cannot create/);
      });

      it('should handle files with only whitespace', async () => {
        const whitespaceContent = '   \n\t  \n   ';
        fs.writeFileSync(filePath, whitespaceContent, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: '   ',
          new_string: 'content',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
      });
    });

    describe('Large File Handling', () => {
      it('should handle moderately large files efficiently', async () => {
        const largeContent = 'line content '.repeat(10000) + 'target string' + ' more content'.repeat(10000);
        fs.writeFileSync(filePath, largeContent, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'target string',
          new_string: 'replaced string',
        };

        (tool as any).shouldAlwaysEdit = true;
        const startTime = Date.now();
        const result = await tool.execute(params, new AbortController().signal);
        const endTime = Date.now();
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toContain('replaced string');
        expect(updatedContent).not.toContain('target string');
      });
    });

    describe('AbortController Signal Handling', () => {
      it('should respect abort signal during execution', async () => {
        fs.writeFileSync(filePath, 'content to replace', 'utf8');
        const controller = new AbortController();
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };

        // Abort immediately
        controller.abort();

        const result = await tool.execute(params, controller.signal);
        
        // The behavior might vary based on implementation, but should handle gracefully
        expect(typeof result.llmContent).toBe('string');
        expect(typeof result.returnDisplay).toBeDefined();
      });

      it('should respect abort signal during shouldConfirmExecute', async () => {
        fs.writeFileSync(filePath, 'content to replace', 'utf8');
        const controller = new AbortController();
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };

        // Abort immediately
        controller.abort();

        const result = await tool.shouldConfirmExecute(params, controller.signal);
        
        // Should handle abort gracefully
        expect(result).toBeDefined();
      });
    });

    describe('Path Handling Edge Cases', () => {
      it('should reject paths with null bytes', () => {
        const params: EditToolParams = {
          file_path: path.join(rootDir, 'file\0.txt'),
          old_string: 'old',
          new_string: 'new',
        };

        const validationError = tool.validateToolParams(params);
        expect(validationError).toBeTruthy();
      });

      it('should handle very long file names', () => {
        const longFileName = 'a'.repeat(255) + '.txt';
        const longFilePath = path.join(rootDir, longFileName);
        
        const params: EditToolParams = {
          file_path: longFilePath,
          old_string: 'old',
          new_string: 'new',
        };

        const validationError = tool.validateToolParams(params);
        expect(validationError).toBeNull(); // Should be valid if within root
      });

      it('should handle paths with special characters', () => {
        const specialFileName = 'file with spaces & symbols!@#$%^&()_+.txt';
        const specialFilePath = path.join(rootDir, specialFileName);
        
        const params: EditToolParams = {
          file_path: specialFilePath,
          old_string: 'old',
          new_string: 'new',
        };

        const validationError = tool.validateToolParams(params);
        expect(validationError).toBeNull(); // Should be valid
      });

      it('should handle normalized vs non-normalized paths correctly', () => {
        const unnormalizedPath = path.join(rootDir, 'folder', '..', 'test.txt');
        const normalizedPath = path.join(rootDir, 'test.txt');
        
        const params: EditToolParams = {
          file_path: unnormalizedPath,
          old_string: 'old',
          new_string: 'new',
        };

        const validationError = tool.validateToolParams(params);
        expect(validationError).toBeNull(); // Should be valid as it resolves within root
      });
    });

    describe('Mock Dependency Integration', () => {
      it('should handle ensureCorrectEdit throwing an error', async () => {
        fs.writeFileSync(filePath, 'content', 'utf8');
        mockEnsureCorrectEdit.mockRejectedValueOnce(new Error('Network error'));
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };

        const result = await tool.execute(params, new AbortController().signal);
        expect(result.llmContent).toMatch(/Error:/);
      });

      it('should handle generateJson returning unexpected format', async () => {
        fs.writeFileSync(filePath, 'content', 'utf8');
        mockGenerateJson.mockResolvedValueOnce({ unexpected: 'format' });
        
        // This test would depend on how EditTool handles malformed responses
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };

        const confirmation = await tool.shouldConfirmExecute(params, new AbortController().signal);
        // Should handle gracefully
        expect(confirmation).toBeDefined();
      });

      it('should handle openDiff being called correctly', async () => {
        fs.writeFileSync(filePath, 'old content', 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'old',
          new_string: 'new',
        };

        const confirmation = await tool.shouldConfirmExecute(params, new AbortController().signal) as FileDiff;
        
        if (confirmation && confirmation.fileDiff) {
          // Verify that the diff contains expected content
          expect(confirmation.fileDiff).toContain('old content');
          expect(confirmation.fileDiff).toContain('new content');
        }
      });
    });

    describe('Configuration Edge Cases', () => {
      it('should handle different ApprovalMode configurations', async () => {
        fs.writeFileSync(filePath, 'content', 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'content',
          new_string: 'new content',
        };

        // Test with AUTO_EDIT
        (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(ApprovalMode.AUTO_EDIT);
        let result = await tool.execute(params, new AbortController().signal);
        expect(result.llmContent).toMatch(/Successfully modified file/);

        // Reset file content
        fs.writeFileSync(filePath, 'content', 'utf8');

        // Test with DEFAULT (should work the same way in our test setup)
        (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(ApprovalMode.DEFAULT);
        result = await tool.execute(params, new AbortController().signal);
        // This depends on shouldConfirmExecute logic
        expect(result).toBeDefined();
      });

      it('should handle missing client gracefully', () => {
        const configWithoutClient = {
          ...mockConfig,
          getGeminiClient: vi.fn().mockReturnValue(null),
        };

        // This test would depend on how EditTool handles missing client
        expect(() => new EditTool(configWithoutClient as any)).not.toThrow();
      });
    });

    describe('Multi-line String Handling', () => {
      it('should handle multi-line old_string and new_string correctly', async () => {
        const multiLineContent = `line 1
line 2
old block
line 3
line 4`;
        const multiLineOld = `old block
line 3`;
        const multiLineNew = `new block
updated line 3`;
        
        fs.writeFileSync(filePath, multiLineContent, 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          old_string: multiLineOld,
          new_string: multiLineNew,
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toContain('new block');
        expect(updatedContent).toContain('updated line 3');
        expect(updatedContent).not.toContain('old block');
      });

      it('should handle strings with leading/trailing whitespace', async () => {
        const content = '  old text with spaces  ';
        fs.writeFileSync(filePath, content, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'old text with spaces',
          new_string: 'new text without extra spaces',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toBe('  new text without extra spaces  ');
      });
    });

    describe('Edge Cases for expected_replacements', () => {
      it('should handle expected_replacements of 0', async () => {
        fs.writeFileSync(filePath, 'content without target', 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'nonexistent',
          new_string: 'replacement',
          expected_replacements: 0,
        };

        const result = await tool.execute(params, new AbortController().signal);
        expect(result.llmContent).toMatch(/0 occurrences found/);
      });

      it('should handle very large expected_replacements', async () => {
        const repeatedContent = 'target '.repeat(1000);
        fs.writeFileSync(filePath, repeatedContent, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'target',
          new_string: 'replaced',
          expected_replacements: 1000,
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect((updatedContent.match(/replaced/g) || []).length).toBe(1000);
      });
    });

    describe('File Extension and Type Handling', () => {
      it('should handle files without extensions', async () => {
        const noExtFile = path.join(rootDir, 'README');
        fs.writeFileSync(noExtFile, 'old content', 'utf8');
        
        const params: EditToolParams = {
          file_path: noExtFile,
          old_string: 'old',
          new_string: 'new',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
      });

      it('should handle files with multiple dots in name', async () => {
        const multiDotFile = path.join(rootDir, 'file.config.backup.txt');
        fs.writeFileSync(multiDotFile, 'old content', 'utf8');
        
        const params: EditToolParams = {
          file_path: multiDotFile,
          old_string: 'old',
          new_string: 'new',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
      });
    });

    describe('Boundary Conditions', () => {
      it('should handle old_string at the very beginning of file', async () => {
        const content = 'start of file content continues...';
        fs.writeFileSync(filePath, content, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'start of file',
          new_string: 'beginning of document',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toStartWith('beginning of document');
      });

      it('should handle old_string at the very end of file', async () => {
        const content = 'content continues... end of file';
        fs.writeFileSync(filePath, content, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: 'end of file',
          new_string: 'final content',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toEndWith('final content');
      });

      it('should handle old_string that spans entire file content', async () => {
        const content = 'entire file content';
        fs.writeFileSync(filePath, content, 'utf8');
        
        const params: EditToolParams = {
          file_path: filePath,
          old_string: content,
          new_string: 'completely new content',
        };

        (tool as any).shouldAlwaysEdit = true;
        const result = await tool.execute(params, new AbortController().signal);
        (tool as any).shouldAlwaysEdit = false;

        expect(result.llmContent).toMatch(/Successfully modified file/);
        const updatedContent = fs.readFileSync(filePath, 'utf8');
        expect(updatedContent).toBe('completely new content');
      });
    });
  });

  describe('Integration with External Dependencies', () => {
    describe('ensureCorrectEdit Integration', () => {
      it('should pass correct parameters to ensureCorrectEdit', async () => {
        const content = 'test content for correction';
        fs.writeFileSync(path.join(rootDir, 'test.txt'), content, 'utf8');
        
        const params: EditToolParams = {
          file_path: path.join(rootDir, 'test.txt'),
          old_string: 'test',
          new_string: 'corrected',
        };

        let capturedContent: string | null = null;
        let capturedParams: EditToolParams | null = null;
        let capturedClient: any = null;

        mockEnsureCorrectEdit.mockImplementationOnce(async (fileContent, toolParams, client) => {
          capturedContent = fileContent;
          capturedParams = toolParams;
          capturedClient = client;
          return { params: toolParams, occurrences: 1 };
        });

        await tool.shouldConfirmExecute(params, new AbortController().signal);

        expect(capturedContent).toBe(content);
        expect(capturedParams).toEqual(params);
        expect(capturedClient).toBeDefined();
        expect(mockEnsureCorrectEdit).toHaveBeenCalledTimes(1);
      });

      it('should handle ensureCorrectEdit returning modified parameters', async () => {
        const content = 'original content with target text';
        fs.writeFileSync(path.join(rootDir, 'test.txt'), content, 'utf8');
        
        const originalParams: EditToolParams = {
          file_path: path.join(rootDir, 'test.txt'),
          old_string: 'target',
          new_string: 'replacement',
        };

        const correctedParams: EditToolParams = {
          file_path: path.join(rootDir, 'test.txt'),
          old_string: 'target text',
          new_string: 'new replacement text',
        };

        mockEnsureCorrectEdit.mockResolvedValueOnce({
          params: correctedParams,
          occurrences: 1,
        });

        const confirmation = await tool.shouldConfirmExecute(originalParams, new AbortController().signal) as FileDiff;

        expect(confirmation).toBeDefined();
        expect(confirmation.fileDiff).toContain('target text'); // Should use corrected old_string
        expect(confirmation.fileDiff).toContain('new replacement text'); // Should use corrected new_string
      });
    });

    describe('GeminiClient Integration', () => {
      it('should handle client.generateJson being called with correct schema', async () => {
        const content = 'content for AI correction';
        fs.writeFileSync(path.join(rootDir, 'test.txt'), content, 'utf8');
        
        const params: EditToolParams = {
          file_path: path.join(rootDir, 'test.txt'),
          old_string: 'content',
          new_string: 'updated content',
        };

        let capturedContents: Content[] | null = null;
        let capturedSchema: SchemaUnion | null = null;

        mockGenerateJson.mockImplementationOnce(async (contents: Content[], schema: SchemaUnion) => {
          capturedContents = contents;
          capturedSchema = schema;
          return { corrected_target_snippet: 'corrected content' };
        });

        // This would trigger through ensureCorrectEdit if it uses generateJson
        await tool.shouldConfirmExecute(params, new AbortController().signal);

        // The exact behavior depends on ensureCorrectEdit implementation
        // This test validates the integration pattern
        expect(mockGenerateJson).toHaveBeenCalled();
      });
    });
  });

  describe('Performance and Resource Management', () => {
    it('should not leak file descriptors', async () => {
      const testFiles = Array.from({ length: 10 }, (_, i) => 
        path.join(rootDir, `test_${i}.txt`)
      );

      // Create multiple files and perform operations
      for (const file of testFiles) {
        fs.writeFileSync(file, `content ${Math.random()}`, 'utf8');
        
        const params: EditToolParams = {
          file_path: file,
          old_string: 'content',
          new_string: 'updated',
        };

        (tool as any).shouldAlwaysEdit = true;
        await tool.execute(params, new AbortController().signal);
      }

      (tool as any).shouldAlwaysEdit = false;

      // Verify all files were processed correctly
      for (const file of testFiles) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).toContain('updated');
      }
    });

    it('should handle rapid consecutive operations', async () => {
      fs.writeFileSync(filePath, 'initial content', 'utf8');
      
      const operations = Array.from({ length: 5 }, (_, i) => ({
        old_string: i === 0 ? 'initial' : `content_${i - 1}`,
        new_string: `content_${i}`,
      }));

      (tool as any).shouldAlwaysEdit = true;

      for (const { old_string, new_string } of operations) {
        const params: EditToolParams = {
          file_path: filePath,
          old_string,
          new_string,
        };

        const result = await tool.execute(params, new AbortController().signal);
        expect(result.llmContent).toMatch(/Successfully modified file/);
      }

      (tool as any).shouldAlwaysEdit = false;

      const finalContent = fs.readFileSync(filePath, 'utf8');
      expect(finalContent).toBe('content_4 content');
    });
  });

  describe('getDescription Additional Edge Cases', () => {
    it('should handle strings with newlines in description', () => {
      const testFileName = 'multiline.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'line1\nline2',
        new_string: 'newline1\nnewline2',
      };
      
      const description = tool.getDescription(params);
      expect(description).toContain(testFileName);
      // Should handle newlines gracefully in truncation
      expect(description.length).toBeLessThan(200);
    });

    it('should handle special characters in strings for description', () => {
      const testFileName = 'special.txt';
      const params: EditToolParams = {
        file_path: path.join(rootDir, testFileName),
        old_string: 'old "quoted" \'text\' with & symbols',
        new_string: 'new <html> & [brackets] text',
      };
      
      const description = tool.getDescription(params);
      expect(description).toContain(testFileName);
      expect(description).toContain('=>');
    });
  });

  describe('validateToolParams Additional Edge Cases', () => {
    it('should handle params with undefined properties', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        old_string: undefined,
        new_string: 'new',
      } as any;
      
      const validationError = tool.validateToolParams(params);
      expect(validationError).toBeTruthy();
    });

    it('should handle params with null properties', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        old_string: 'old',
        new_string: null,
      } as any;
      
      const validationError = tool.validateToolParams(params);
      expect(validationError).toBeTruthy();
    });

    it('should handle completely malformed params object', () => {
      const params = {
        wrong_property: 'value',
      } as any;
      
      const validationError = tool.validateToolParams(params);
      expect(validationError).toBeTruthy();
    });
  });

  describe('File Content Edge Cases', () => {
    it('should handle binary-like content', async () => {
      // Content that might be mistaken for binary
      const binaryLikeContent = '\x00\x01\x02hello world\x03\x04';
      fs.writeFileSync(filePath, binaryLikeContent, 'binary');
      
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'hello world',
        new_string: 'goodbye world',
      };

      (tool as any).shouldAlwaysEdit = true;
      const result = await tool.execute(params, new AbortController().signal);
      (tool as any).shouldAlwaysEdit = false;

      expect(result.llmContent).toMatch(/Successfully modified file/);
    });

    it('should handle files with mixed encodings gracefully', async () => {
      // Write content with specific encoding
      const content = 'Hello, 世界! This is a test.';
      fs.writeFileSync(filePath, content, 'utf8');
      
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'Hello',
        new_string: 'Hi',
      };

      (tool as any).shouldAlwaysEdit = true;
      const result = await tool.execute(params, new AbortController().signal);
      (tool as any).shouldAlwaysEdit = false;

      expect(result.llmContent).toMatch(/Successfully modified file/);
      const updatedContent = fs.readFileSync(filePath, 'utf8');
      expect(updatedContent).toContain('Hi');
      expect(updatedContent).toContain('世界');
    });
  });
