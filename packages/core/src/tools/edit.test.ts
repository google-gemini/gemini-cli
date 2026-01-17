/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFixLLMEditWithInstruction = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

import { IdeClient } from '../ide/ide-client.js';

vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../utils/llm-edit-fixer.js', () => ({
  FixLLMEditWithInstruction: mockFixLLMEditWithInstruction,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
    getHistory: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../utils/editor.js', () => ({
  openDiff: mockOpenDiff,
}));

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import {
  EditTool,
  type EditToolParams,
  applyReplacement,
  calculateReplacement,
} from './edit.js';
import { type FileDiff, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ApprovalMode } from '../policy/types.js';
import { type Config } from '../config/config.js';
import { type Content, type Part, type SchemaUnion } from '@google/genai';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

describe('EditTool', () => {
  let tool: EditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;
  let geminiClient: any;
  let fileSystemService: StandardFileSystemService;
  let baseLlmClient: BaseLlmClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    geminiClient = {
      generateJson: mockGenerateJson,
      getHistory: vi.fn().mockResolvedValue([]),
    };

    baseLlmClient = {
      generateJson: mockGenerateJson,
    } as unknown as BaseLlmClient;

    fileSystemService = new StandardFileSystemService();

    mockConfig = {
      getUsageStatisticsEnabled: vi.fn(() => true),
      getSessionId: vi.fn(() => 'mock-session-id'),
      getContentGeneratorConfig: vi.fn(() => ({ authType: 'mock' })),
      getProxy: vi.fn(() => undefined),
      getGeminiClient: vi.fn().mockReturnValue(geminiClient),
      getBaseLlmClient: vi.fn().mockReturnValue(baseLlmClient),
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getWorkspaceContext: () => createMockWorkspaceContext(rootDir),
      getFileSystemService: () => fileSystemService,
      getIdeMode: () => false,
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
      getToolRegistry: () => ({}) as any,
      isInteractive: () => false,
      getDisableLLMCorrection: vi.fn(() => false),
      getExperiments: () => {},
    } as unknown as Config;

    (mockConfig.getApprovalMode as Mock).mockClear();
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);

    mockFixLLMEditWithInstruction.mockReset();
    mockFixLLMEditWithInstruction.mockResolvedValue({
      noChangesRequired: false,
      search: '',
      replace: '',
      explanation: 'LLM fix failed',
    });

    mockGenerateJson.mockReset();
    mockGenerateJson.mockImplementation(
      async (contents: Content[], schema: SchemaUnion) => {
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

        if ((schema as any).properties?.corrected_target_snippet) {
          return Promise.resolve({
            corrected_target_snippet: problematicSnippet,
          });
        }
        if ((schema as any).properties?.corrected_new_string) {
          const originalNewStringMatch = promptText.match(
            /original_new_string \(what was intended to replace original_old_string\):\n```\n([\s\S]*?)\n```/,
          );
          const originalNewString =
            originalNewStringMatch && originalNewStringMatch[1]
              ? originalNewStringMatch[1]
              : '';
          return Promise.resolve({ corrected_new_string: originalNewString });
        }
        return Promise.resolve({});
      },
    );

    const bus = createMockMessageBus();
    getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
    tool = new EditTool(mockConfig, bus);
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

    it.each([
      {
        name: '$ literal',
        current: "price is $100 and pattern end is ' '",
        oldStr: 'price is $100',
        newStr: 'price is $200',
        expected: "price is $200 and pattern end is ' '",
      },
      {
        name: "$' literal",
        current: 'foo',
        oldStr: 'foo',
        newStr: "bar$'baz",
        expected: "bar$'baz",
      },
      {
        name: '$& literal',
        current: 'hello world',
        oldStr: 'hello',
        newStr: '$&-replacement',
        expected: '$&-replacement world',
      },
      {
        name: '$` literal',
        current: 'prefix-middle-suffix',
        oldStr: 'middle',
        newStr: 'new$`content',
        expected: 'prefix-new$`content-suffix',
      },
      {
        name: '$1, $2 capture groups literal',
        current: 'test string',
        oldStr: 'test',
        newStr: '$1$2replacement',
        expected: '$1$2replacement string',
      },
      {
        name: 'normal strings without problematic $',
        current: 'normal text replacement',
        oldStr: 'text',
        newStr: 'string',
        expected: 'normal string replacement',
      },
      {
        name: 'multiple occurrences with $ sequences',
        current: 'foo bar foo baz',
        oldStr: 'foo',
        newStr: "test$'end",
        expected: "test$'end bar test$'end baz",
      },
      {
        name: 'complex regex patterns with $ at end',
        current: "| select('match', '^[sv]d[a-z]$')",
        oldStr: "'^[sv]d[a-z]$'",
        newStr: "'^[sv]d[a-z]$' # updated",
        expected: "| select('match', '^[sv]d[a-z]$' # updated)",
      },
      {
        name: 'empty replacement with problematic $',
        current: 'test content',
        oldStr: 'nothing',
        newStr: "replacement$'text",
        expected: 'test content',
      },
      {
        name: '$$ (escaped dollar)',
        current: 'price value',
        oldStr: 'value',
        newStr: '$$100',
        expected: 'price $$100',
      },
    ])('should handle $name', ({ current, oldStr, newStr, expected }) => {
      const result = applyReplacement(current, oldStr, newStr, false);
      expect(result).toBe(expected);
    });
  });

  describe('calculateReplacement', () => {
    const abortSignal = new AbortController().signal;

    it.each([
      {
        name: 'perform an exact replacement',
        content: 'hello world',
        old_string: 'world',
        new_string: 'moon',
        expected: 'hello moon',
        occurrences: 1,
      },
      {
        name: 'perform a flexible, whitespace-insensitive replacement',
        content: '  hello\n    world\n',
        old_string: 'hello\nworld',
        new_string: 'goodbye\nmoon',
        expected: '  goodbye\n  moon\n',
        occurrences: 1,
      },
      {
        name: 'return 0 occurrences if no match is found',
        content: 'hello world',
        old_string: 'nomatch',
        new_string: 'moon',
        expected: 'hello world',
        occurrences: 0,
      },
    ])(
      'should $name',
      async ({ content, old_string, new_string, expected, occurrences }) => {
        const result = await calculateReplacement(mockConfig, {
          params: {
            file_path: 'test.txt',
            instruction: 'test',
            old_string,
            new_string,
          },
          currentContent: content,
          abortSignal,
        });
        expect(result.newContent).toBe(expected);
        expect(result.occurrences).toBe(occurrences);
      },
    );

    it('should perform a regex-based replacement for flexible intra-line whitespace', async () => {
      // This case would fail with the previous exact and line-trimming flexible logic
      // because the whitespace *within* the line is different.
      const content = '  function  myFunc( a, b ) {\n    return a + b;\n  }';
      const result = await calculateReplacement(mockConfig, {
        params: {
          file_path: 'test.js',
          instruction: 'test',
          old_string: 'function myFunc(a, b) {', // Note the normalized whitespace
          new_string: 'const yourFunc = (a, b) => {',
        },
        currentContent: content,
        abortSignal,
      });

      // The indentation from the original line should be preserved and applied to the new string.
      const expectedContent =
        '  const yourFunc = (a, b) => {\n    return a + b;\n  }';
      expect(result.newContent).toBe(expectedContent);
      expect(result.occurrences).toBe(1);
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params', () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'test.txt'),
        instruction: 'An instruction',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return an error if path is outside the workspace', () => {
      const params: EditToolParams = {
        file_path: path.join(os.tmpdir(), 'outside.txt'),
        instruction: 'An instruction',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /must be within one of the workspace directories/,
      );
    });
  });

  describe('execute', () => {
    const testFile = 'execute_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('should reject when calculateEdit fails after an abort signal', async () => {
      const params: EditToolParams = {
        file_path: path.join(rootDir, 'abort-execute.txt'),
        instruction: 'Abort during execute',
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const abortController = new AbortController();
      const abortError = new Error('Abort requested during edit execution');

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
      const newContent = 'This is some new text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace old with new',
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(newContent);
      const display = result.returnDisplay as FileDiff;
      expect(display.fileDiff).toMatch(initialContent);
      expect(display.fileDiff).toMatch(newContent);
      expect(display.fileName).toBe(testFile);
    });

    it('should return error if old_string is not found in file', async () => {
      fs.writeFileSync(filePath, 'Some content.', 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace non-existent text',
        old_string: 'nonexistent',
        new_string: 'replacement',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toMatch(/0 occurrences found for old_string/);
      expect(result.returnDisplay).toMatch(
        /Failed to edit, could not find the string to replace./,
      );
      expect(mockFixLLMEditWithInstruction).toHaveBeenCalled();
    });

    it('should succeed if FixLLMEditWithInstruction corrects the params', async () => {
      const initialContent = 'This is some original text.';
      const finalContent = 'This is some brand new text.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace original with brand new',
        old_string: 'wrong text', // This will fail first
        new_string: 'brand new text',
      };

      mockFixLLMEditWithInstruction.mockResolvedValueOnce({
        noChangesRequired: false,
        search: 'original text', // The corrected search string
        replace: 'brand new text',
        explanation: 'Corrected the search string to match the file content.',
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toMatch(/Successfully modified file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(finalContent);
      expect(mockFixLLMEditWithInstruction).toHaveBeenCalledTimes(1);
    });

    it('should preserve CRLF line endings when editing a file', async () => {
      const initialContent = 'line one\r\nline two\r\n';
      const newContent = 'line one\r\nline three\r\n';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace two with three',
        old_string: 'line two',
        new_string: 'line three',
      };

      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      const finalContent = fs.readFileSync(filePath, 'utf8');
      expect(finalContent).toBe(newContent);
    });

    it('should create a new file with CRLF line endings if new_string has them', async () => {
      const newContentWithCRLF = 'new line one\r\nnew line two\r\n';
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Create a new file',
        old_string: '',
        new_string: newContentWithCRLF,
      };

      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      const finalContent = fs.readFileSync(filePath, 'utf8');
      expect(finalContent).toBe(newContentWithCRLF);
    });

    it('should return NO_CHANGE if FixLLMEditWithInstruction determines no changes are needed', async () => {
      const initialContent = 'The price is $100.';
      fs.writeFileSync(filePath, initialContent, 'utf8');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Ensure the price is $100',
        old_string: 'price is $50', // Incorrect old string
        new_string: 'price is $100',
      };

      mockFixLLMEditWithInstruction.mockResolvedValueOnce({
        noChangesRequired: true,
        search: '',
        replace: '',
        explanation: 'The price is already correctly set to $100.',
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error?.type).toBe(
        ToolErrorType.EDIT_NO_CHANGE_LLM_JUDGEMENT,
      );
      expect(result.llmContent).toMatch(
        /A secondary check by an LLM determined/,
      );
      expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent); // File is unchanged
    });
  });

  describe('self-correction with content refresh to pull in external edits', () => {
    const testFile = 'test.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it('should use refreshed file content for self-correction if file was modified externally', async () => {
      const initialContent = 'This is the original content.';
      const externallyModifiedContent =
        'This is the externally modified content.';
      fs.writeFileSync(filePath, initialContent, 'utf8');

      const params: EditToolParams = {
        file_path: filePath,
        instruction:
          'Replace "externally modified content" with "externally modified string"',
        old_string: 'externally modified content', // This will fail the first attempt, triggering self-correction.
        new_string: 'externally modified string',
      };

      // Spy on `readTextFile` to simulate an external file change between reads.
      const readTextFileSpy = vi
        .spyOn(fileSystemService, 'readTextFile')
        .mockResolvedValueOnce(initialContent) // First call in `calculateEdit`
        .mockResolvedValueOnce(externallyModifiedContent); // Second call in `attemptSelfCorrection`

      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      // Assert that the file was read twice (initial read, then re-read for hash comparison).
      expect(readTextFileSpy).toHaveBeenCalledTimes(2);

      // Assert that the self-correction LLM was called with the updated content and a specific message.
      expect(mockFixLLMEditWithInstruction).toHaveBeenCalledWith(
        expect.any(String), // instruction
        params.old_string,
        params.new_string,
        expect.stringContaining(
          'However, the file has been modified by either the user or an external process',
        ), // errorForLlmEditFixer
        externallyModifiedContent, // The new content for correction
        expect.any(Object), // baseLlmClient
        expect.any(Object), // abortSignal
      );
    });
  });

  describe('Error Scenarios', () => {
    const testFile = 'error_test.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it.each([
      {
        name: 'FILE_NOT_FOUND',
        setup: () => {}, // no file created
        params: { old_string: 'any', new_string: 'new' },
        expectedError: ToolErrorType.FILE_NOT_FOUND,
      },
      {
        name: 'ATTEMPT_TO_CREATE_EXISTING_FILE',
        setup: (fp: string) => fs.writeFileSync(fp, 'existing content', 'utf8'),
        params: { old_string: '', new_string: 'new content' },
        expectedError: ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
      },
      {
        name: 'NO_OCCURRENCE_FOUND',
        setup: (fp: string) => fs.writeFileSync(fp, 'content', 'utf8'),
        params: { old_string: 'not-found', new_string: 'new' },
        expectedError: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
      },
      {
        name: 'EXPECTED_OCCURRENCE_MISMATCH',
        setup: (fp: string) => fs.writeFileSync(fp, 'one one two', 'utf8'),
        params: { old_string: 'one', new_string: 'new' },
        expectedError: ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
      },
    ])(
      'should return $name error',
      async ({ setup, params, expectedError }) => {
        setup(filePath);
        const invocation = tool.build({
          file_path: filePath,
          instruction: 'test',
          ...params,
        });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error?.type).toBe(expectedError);
      },
    );
  });

  describe('expected_replacements', () => {
    const testFile = 'replacements_test.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
    });

    it.each([
      {
        name: 'succeed when occurrences match expected_replacements',
        content: 'foo foo foo',
        expected: 3,
        shouldSucceed: true,
        finalContent: 'bar bar bar',
      },
      {
        name: 'fail when occurrences do not match expected_replacements',
        content: 'foo foo foo',
        expected: 2,
        shouldSucceed: false,
      },
      {
        name: 'default to 1 expected replacement if not specified',
        content: 'foo foo',
        expected: undefined,
        shouldSucceed: false,
      },
    ])(
      'should $name',
      async ({ content, expected, shouldSucceed, finalContent }) => {
        fs.writeFileSync(filePath, content, 'utf8');
        const params: EditToolParams = {
          file_path: filePath,
          instruction: 'Replace all foo with bar',
          old_string: 'foo',
          new_string: 'bar',
          ...(expected !== undefined && { expected_replacements: expected }),
        };
        const invocation = tool.build(params);
        const result = await invocation.execute(new AbortController().signal);

        if (shouldSucceed) {
          expect(result.error).toBeUndefined();
          if (finalContent)
            expect(fs.readFileSync(filePath, 'utf8')).toBe(finalContent);
        } else {
          expect(result.error?.type).toBe(
            ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
          );
        }
      },
    );
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
        instruction: 'test',
        old_string: 'old',
        new_string: 'new',
      };

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

  describe('shouldConfirmExecute', () => {
    it('should rethrow calculateEdit errors when the abort signal is triggered', async () => {
      const filePath = path.join(rootDir, 'abort-confirmation.txt');
      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Abort during confirmation',
        old_string: 'old',
        new_string: 'new',
      };

      const invocation = tool.build(params);
      const abortController = new AbortController();
      const abortError = new Error('Abort requested during edit confirmation');

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
          instruction: `Remove lines from the file`,
          old_string: file.toRemove,
          new_string: '', // Removing the content
          ai_proposed_content: '',
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
          throw result.error;
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

  describe('disableLLMCorrection', () => {
    it('should NOT call FixLLMEditWithInstruction when disableLLMCorrection is true', async () => {
      const filePath = path.join(rootDir, 'disable_llm_test.txt');
      fs.writeFileSync(filePath, 'Some content.', 'utf8');

      // Enable the setting
      (mockConfig.getDisableLLMCorrection as Mock).mockReturnValue(true);

      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace non-existent text',
        old_string: 'nonexistent',
        new_string: 'replacement',
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND);
      expect(mockFixLLMEditWithInstruction).not.toHaveBeenCalled();
    });

    it('should call FixLLMEditWithInstruction when disableLLMCorrection is false (default)', async () => {
      const filePath = path.join(rootDir, 'enable_llm_test.txt');
      fs.writeFileSync(filePath, 'Some content.', 'utf8');

      // Default is false, but being explicit
      (mockConfig.getDisableLLMCorrection as Mock).mockReturnValue(false);

      const params: EditToolParams = {
        file_path: filePath,
        instruction: 'Replace non-existent text',
        old_string: 'nonexistent',
        new_string: 'replacement',
      };

      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      expect(mockFixLLMEditWithInstruction).toHaveBeenCalled();
    });
  });
});
