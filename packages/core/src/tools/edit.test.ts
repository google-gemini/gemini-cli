/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockEnsureCorrectEdit = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

import { IdeClient } from '../ide/ide-client.js';

vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn(),
  },
}));

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

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

interface EditFileParameterSchema {
  properties: {
    file_path: {
      description: string;
    };
  };
}

import type { Mock } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EditToolParams } from './edit.js';
import { applyReplacement, EditTool } from './edit.js';
import type { FileDiff } from './tools.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { Content, Part, SchemaUnion } from '@google/genai';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

describe('EditTool', () => {
  let tool: EditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;
  let geminiClient: any;
  let baseLlmClient: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    geminiClient = {
      generateJson: mockGenerateJson, // mockGenerateJson is already defined and hoisted
    };

    baseLlmClient = {
      generateJson: vi.fn(),
    };

    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(geminiClient),
      getBaseLlmClient: vi.fn().mockReturnValue(baseLlmClient),
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getWorkspaceContext: () => new WorkspaceContext(rootDir),
      getFileSystemService: () => new StandardFileSystemService(),
      getIdeMode: () => false,
      // getGeminiConfig: () => ({ apiKey: 'test-api-key' }), // This was not a real Config method
      // Add other properties/methods of Config if EditTool uses them
      // Minimal other methods to satisfy Config type if needed by EditTool constructor or other direct uses:
      getApiKey: () => 'test-api-key',
      getModel: () => 'test-model',
      getSandbox: () => false,
      getDebugMode: () => false,
      getQuestion: () => undefined,

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
    mockEnsureCorrectEdit.mockImplementation(
      async (_, currentContent, params) => {
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
      },
    );

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

  describe('applyReplacement', () => {
    it('should return newString if isNewFile is true', () => {
      expect(applyReplacement(null, 'old', 'new', true)).toBe('new');
      expect(applyReplacement('existing', 'old', 'new', true)).toBe('new');
    });

    it('should return newString if currentContent is null and oldString is empty (defensive)', () => {
      expect(applyReplacement(null, '', 'new', false)).toBe('new');
    });

    it('should return empty string if currentContent is null and oldString is not empty (defensive)', () => {
      expect(applyReplacement(null, 'old', 'new', false)).toBe('');
    });

    it('should replace oldString with newString in currentContent', () => {
      expect(applyReplacement('hello old world old', 'old', 'new', false)).toBe(
        'hello new world new',
      );
    });

    it('should return currentContent if oldString is empty and not a new file', () => {
      expect(applyReplacement('hello world', '', 'new', false)).toBe(
        'hello world',
      );
    });

    it('should treat $ literally and not as replacement pattern', () => {
      const current = "price is $100 and pattern end is ' '";
      const oldStr = 'price is $100';
      const newStr = 'price is $200';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe("price is $200 and pattern end is ' '");
    });

    it("should treat $' literally and not as a replacement pattern", () => {
      const current = 'foo';
      const oldStr = 'foo';
      const newStr = "bar$'baz";
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe("bar$'baz");
    });

    it('should treat $& literally and not as a replacement pattern', () => {
      const current = 'hello world';
      const oldStr = 'hello';
      const newStr = '$&-replacement';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('$&-replacement world');
    });

    it('should treat $` literally and not as a replacement pattern', () => {
      const current = 'prefix-middle-suffix';
      const oldStr = 'middle';
      const newStr = 'new$`content';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('prefix-new$`content-suffix');
    });

    it('should treat $1, $2 capture groups literally', () => {
      const current = 'test string';
      const oldStr = 'test';
      const newStr = '$1$2replacement';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('$1$2replacement string');
    });

    it('should use replaceAll for normal strings without problematic $ sequences', () => {
      const current = 'normal text replacement';
      const oldStr = 'text';
      const newStr = 'string';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('normal string replacement');
    });

    it('should handle multiple occurrences with problematic $ sequences', () => {
      const current = 'foo bar foo baz';
      const oldStr = 'foo';
      const newStr = "test$'end";
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe("test$'end bar test$'end baz");
    });

    it('should handle complex regex patterns with $ at end', () => {
      const current = "| select('match', '^[sv]d[a-z]$')";
      const oldStr = "'^[sv]d[a-z]$'";
      const newStr = "'^[sv]d[a-z]$' # updated";
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe("| select('match', '^[sv]d[a-z]$' # updated)");
    });

    it('should handle empty replacement with problematic $ in newString', () => {
      const current = 'test content';
      const oldStr = 'nothing';
      const newStr = "replacement$'text";
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('test content'); // No replacement because oldStr not found
    });

    it('should handle $$ (escaped dollar) correctly', () => {
      const current = 'price value';
      const oldStr = 'value';
      const newStr = '$$100';
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe('price $$100');
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

    it('should return error for path outside root', () => {
      const params: EditToolParams = {
        file_path: path.join(tempDir, 'outside-root.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      const error = tool.validateToolParams(params);
      expect(error).toContain(
        'File path must be within one of the workspace directories',
      );
    });
  });

  describe('shouldConfirmExecute', () => {
    const testFile = 'edit_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('should resolve relative path and request confirmation', async () => {
      fs.writeFileSync(filePath, 'some old content here');
      const params: EditToolParams = {
        file_path: testFile, // relative path
        old_string: 'old',
        new_string: 'new',
      };
      // ensureCorrectEdit will be called by shouldConfirmExecute
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: { ...params, file_path: filePath },
        occurrences: 1,
      });
      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
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

    it('should request confirmation for valid edit', async () => {
      fs.writeFileSync(filePath, 'some old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      // ensureCorrectEdit will be called by shouldConfirmExecute
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 1 });
      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
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
      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).toBe(false);
    });

    it('should return false if multiple occurrences of old_string are found (ensureCorrectEdit returns > 1)', async () => {
      fs.writeFileSync(filePath, 'old old content here');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 2 });
      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(confirmation).toBe(false);
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
      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
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
        async (_, content, p, client, baseClient) => {
          mockCalled = true;
          expect(content).toBe(originalContent);
          expect(p).toBe(params);
          expect(client).toBe(geminiClient);
          expect(baseClient).toBe(baseLlmClient);
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
      const invocation = tool.build(params);
      const confirmation = (await invocation.shouldConfirmExecute(
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

    it('should rethrow calculateEdit errors when the abort signal is triggered', async () => {
      const filePath = path.join(rootDir, 'abort-confirmation.txt');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const abortController = new AbortController();
      const abortError = new Error('Abort requested');

      const calculateSpy = vi
        .spyOn(invocation as any, 'calculateEdit')
        .mockImplementation(async () => {
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
          throw abortError;
        });

      await expect(
        invocation.shouldConfirmExecute(abortController.signal),
      ).rejects.toBe(abortError);

      calculateSpy.mockRestore();
    });
  });

  describe('execute', () => {
    const testFile = 'execute_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
      // Default for execute tests, can be overridden
      mockEnsureCorrectEdit.mockImplementation(async (_, content, params) => {
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

    it('should resolve relative path and execute successfully', async () => {
      const initialContent = 'This is some old text.';
      const newContent = 'This is some new text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: testFile, // relative path
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
    });

    it('should throw error if file path is empty', async () => {
      const params: EditToolParams = {
        file_path: '',
        old_string: 'old',
        new_string: 'new',
      };
      expect(() => tool.build(params)).toThrow(
        /The 'file_path' parameter must be non-empty./,
      );
    });

    it('should reject when calculateEdit fails after an abort signal', async () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'abort-execute.txt'),
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const abortController = new AbortController();
      const abortError = new Error('Abort requested during execute');

      const calculateSpy = vi
        .spyOn(invocation as any, 'calculateEdit')
        .mockImplementation(async () => {
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
          throw abortError;
        });

      await expect(invocation.execute(abortController.signal)).rejects.toBe(
        abortError,
      );

      calculateSpy.mockRestore();
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

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

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
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toMatch(/Created new file/);
      expect(fs.existsSync(newFilePath)).toBe(true);
      expect(fs.readFileSync(newFilePath, 'utf8')).toBe(fileContent);

      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(/\+Content for the new file\./);
      expect(display.fileName).toBe(newFileName);
      expect((result.returnDisplay as FileDiff).diffStat).toStrictEqual({
        model_added_lines: 1,
        model_removed_lines: 0,
        model_added_chars: 25,
        model_removed_chars: 0,
        user_added_lines: 0,
        user_removed_lines: 0,
        user_added_chars: 0,
        user_removed_chars: 0,
      });
    });

    it('should return error if old_string is not found in file', async () => {
      fs.writeFileSync(filePath, 'Some content.', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'nonexistent',
        new_string: 'replacement',
      };
      // The default mockEnsureCorrectEdit will return 0 occurrences for 'nonexistent'
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
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
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toMatch(
        /Expected 1 occurrence but found 2 for old_string in file/,
      );
      expect(result.returnDisplay).toMatch(
        /Failed to edit, expected 1 occurrence but found 2/,
      );
    });

    it('should successfully replace multiple occurrences when expected_replacements specified', async () => {
      fs.writeFileSync(filePath, 'old text\nold text\nold text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3,
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(
        'new text\nnew text\nnew text',
      );
      const display = result.returnDisplay as FileDiff;

      expect(display.fileDiff).toMatch(/-old text\n-old text\n-old text/);
      expect(display.fileDiff).toMatch(/\+new text\n\+new text\n\+new text/);
      expect(display.fileName).toBe(testFile);
      expect((result.returnDisplay as FileDiff).diffStat).toStrictEqual({
        model_added_lines: 3,
        model_removed_lines: 3,
        model_added_chars: 24,
        model_removed_chars: 24,
        user_added_lines: 0,
        user_removed_lines: 0,
        user_added_chars: 0,
        user_removed_chars: 0,
      });
    });

    it('should return error if expected_replacements does not match actual occurrences', async () => {
      fs.writeFileSync(filePath, 'old text old text', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        expected_replacements: 3, // Expecting 3 but only 2 exist
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
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
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toMatch(/File already exists, cannot create/);
      expect(result.returnDisplay).toMatch(
        /Attempted to create a file that already exists/,
      );
    });

    it('should include modification message when proposed content is modified', async () => {
      const initialContent = 'Line 1\nold line\nLine 3\nLine 4\nLine 5\n';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
        modified_by_user: true,
        ai_proposed_content: 'Line 1\nAI line\nLine 3\nLine 4\nLine 5\n',
      };

      (mockConfig.getApprovalMode as Mock).mockReturnValueOnce(
        ApprovalMode.AUTO_EDIT,
      );
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toMatch(
        /User modified the `new_string` content/,
      );
      expect((result.returnDisplay as FileDiff).diffStat).toStrictEqual({
        model_added_lines: 1,
        model_removed_lines: 1,
        model_added_chars: 7,
        model_removed_chars: 8,
        user_added_lines: 1,
        user_removed_lines: 1,
        user_added_chars: 8,
        user_removed_chars: 7,
      });
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
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

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
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).not.toMatch(
        /User modified the `new_string` content/,
      );
    });

    it('should return error if old_string and new_string are identical', async () => {
      const initialContent = 'This is some identical text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'identical',
        new_string: 'identical',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toMatch(/No changes to apply/);
      expect(result.returnDisplay).toMatch(/No changes to apply/);
    });

    it('should return EDIT_NO_CHANGE error if replacement results in identical content', async () => {
      // This can happen if ensureCorrectEdit finds a fuzzy match, but the literal
      // string replacement with `replaceAll` results in no change.
      const initialContent = 'line 1\nline  2\nline 3'; // Note the double space
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        // old_string has a single space, so it won't be found by replaceAll
        old_string: 'line 1\nline 2\nline 3',
        new_string: 'line 1\nnew line 2\nline 3',
      };

      // Mock ensureCorrectEdit to simulate it finding a match (e.g., via fuzzy matching)
      // but it doesn't correct the old_string to the literal content.
      mockEnsureCorrectEdit.mockResolvedValueOnce({ params, occurrences: 1 });

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_CHANGE);
      expect(result.returnDisplay).toMatch(
        /No changes to apply. The new content is identical to the current content./,
      );
      // Ensure the file was not actually changed
      expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent);
    });
  });

  describe('Error Scenarios', () => {
    const testFile = 'error_test.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('should return FILE_NOT_FOUND error', async () => {
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'any',
        new_string: 'new',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.FILE_NOT_FOUND);
    });

    it('should return ATTEMPT_TO_CREATE_EXISTING_FILE error', async () => {
      fs.writeFileSync(filePath, 'existing content', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: '',
        new_string: 'new content',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(
        ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
      );
    });

    it('should return NO_OCCURRENCE_FOUND error', async () => {
      fs.writeFileSync(filePath, 'content', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'not-found',
        new_string: 'new',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND);
    });

    it('should return EXPECTED_OCCURRENCE_MISMATCH error', async () => {
      fs.writeFileSync(filePath, 'one one two', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'one',
        new_string: 'new',
        expected_replacements: 3,
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(
        ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
      );
    });

    it('should return NO_CHANGE error', async () => {
      fs.writeFileSync(filePath, 'content', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'content',
        new_string: 'content',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_CHANGE);
    });

    it('should not throw error for relative path', async () => {
      const params: EditToolParams = {
        file_path: 'relative/path.txt',
        old_string: 'a',
        new_string: 'b',
      };
      expect(() => tool.build(params)).not.toThrow();
    });

    it('should return FILE_WRITE_FAILURE on write error', async () => {
      fs.writeFileSync(filePath, 'content', 'utf8');
      // Make file readonly to trigger a write error
      fs.chmodSync(filePath, '444');

      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'content',
        new_string: 'new content',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
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
      const invocation = tool.build(params);
      // shortenPath will be called internally, resulting in just the file name
      expect(invocation.getDescription()).toBe(
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
      const invocation = tool.build(params);
      // shortenPath will be called internally, resulting in just the file name
      // The snippets are truncated at 30 chars + '...'
      expect(invocation.getDescription()).toBe(
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
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(`${testFileName}: old => new`);
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
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        `${testFileName}: this is a very long old string... => this is a very long new string...`,
      );
    });
  });

  describe('workspace boundary validation', () => {
    it('should validate paths are within workspace root', () => {
      const validPath = {
        file_path: path.join(rootDir, 'file.txt'),
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(validPath)).toBeNull();
    });

    it('should reject paths outside workspace root', () => {
      const invalidPath = {
        file_path: '/etc/passwd',
        old_string: 'root',
        new_string: 'hacked',
      };
      const error = tool.validateToolParams(invalidPath);
      expect(error).toContain(
        'File path must be within one of the workspace directories',
      );
      expect(error).toContain(rootDir);
    });
  });

  describe('constructor', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should use windows-style path examples on windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

      const tool = new EditTool({} as unknown as Config);
      const schema = tool.schema;
      expect(
        (schema.parametersJsonSchema as EditFileParameterSchema).properties
          .file_path.description,
      ).toBe('The path to the file to modify.');
    });

    it('should use unix-style path examples on non-windows platforms', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

      const tool = new EditTool({} as unknown as Config);
      const schema = tool.schema;
      expect(
        (schema.parametersJsonSchema as EditFileParameterSchema).properties
          .file_path.description,
      ).toBe('The path to the file to modify.');
    });
  });

  describe('IDE mode', () => {
    const testFile = 'edit_me.txt';
    let filePath: string;
    let ideClient: any;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
      ideClient = {
        openDiff: vi.fn(),
        isDiffingEnabled: vi.fn().mockReturnValue(true),
      };
      vi.mocked(IdeClient.getInstance).mockResolvedValue(ideClient);
      (mockConfig as any).getIdeMode = () => true;
    });

    it('should call ideClient.openDiff and update params on confirmation', async () => {
      const initialContent = 'some old content here';
      const newContent = 'some new content here';
      const modifiedContent = 'some modified content here';
      fs.writeFileSync(filePath, initialContent);
      const params: EditToolParams = {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      };
      mockEnsureCorrectEdit.mockResolvedValueOnce({
        params: { ...params, old_string: 'old', new_string: 'new' },
        occurrences: 1,
      });
      ideClient.openDiff.mockResolvedValueOnce({
        status: 'accepted',
        content: modifiedContent,
      });

      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(ideClient.openDiff).toHaveBeenCalledWith(filePath, newContent);

      if (confirmation && 'onConfirm' in confirmation) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      expect(params.old_string).toBe(initialContent);
      expect(params.new_string).toBe(modifiedContent);
    });
  });

  describe('multiple file edits', () => {
    it('should perform multiple removals and report correct diff stats', async () => {
      const numFiles = 10;
      const files: Array<{
        path: string;
        initialContent: string;
        toRemove: string;
      }> = [];
      const expectedLinesRemoved: number[] = [];
      const actualLinesRemoved: number[] = [];

      // 1. Create 10 files with 5-10 lines each
      for (let i = 0; i < numFiles; i++) {
        const fileName = `test-file-${i}.txt`;
        const filePath = path.join(rootDir, fileName);
        const numLines = Math.floor(Math.random() * 6) + 5; // 5 to 10 lines
        const lines = Array.from(
          { length: numLines },
          (_, j) => `File ${i}, Line ${j + 1}`,
        );
        const content = lines.join('\n') + '\n';

        // Determine which lines to remove (2 or 3 lines)
        const numLinesToRemove = Math.floor(Math.random() * 2) + 2; // 2 or 3
        expectedLinesRemoved.push(numLinesToRemove);
        const startLineToRemove = 1; // Start removing from the second line
        const linesToRemove = lines.slice(
          startLineToRemove,
          startLineToRemove + numLinesToRemove,
        );
        const toRemove = linesToRemove.join('\n') + '\n';

        fs.writeFileSync(filePath, content, 'utf8');
        files.push({
          path: filePath,
          initialContent: content,
          toRemove,
        });
      }

      // 2. Create and execute 10 tool calls for removal
      for (const file of files) {
        const params: EditToolParams = {
          file_path: file.path,
          old_string: file.toRemove,
          new_string: '', // Removing the content
        };
        const invocation = tool.build(params);
        const result = await invocation.execute(new AbortController().signal);

        if (
          result.returnDisplay &&
          typeof result.returnDisplay === 'object' &&
          'diffStat' in result.returnDisplay &&
          result.returnDisplay.diffStat
        ) {
          actualLinesRemoved.push(
            result.returnDisplay.diffStat?.model_removed_lines,
          );
        } else if (result.error) {
          console.error(`Edit failed for ${file.path}:`, result.error);
        }
      }

      // 3. Assert that the content was removed from each file
      for (const file of files) {
        const finalContent = fs.readFileSync(file.path, 'utf8');
        const expectedContent = file.initialContent.replace(file.toRemove, '');
        expect(finalContent).toBe(expectedContent);
        expect(finalContent).not.toContain(file.toRemove);
      }

      // 4. Assert that the total number of removed lines matches the diffStat total
      const totalExpectedRemoved = expectedLinesRemoved.reduce(
        (sum, current) => sum + current,
        0,
      );
      const totalActualRemoved = actualLinesRemoved.reduce(
        (sum, current) => sum + current,
        0,
      );
      expect(totalActualRemoved).toBe(totalExpectedRemoved);
    });
  });
});
