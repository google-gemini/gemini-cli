/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFixLLMEditWithInstruction = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

import { IdeClient, IDEConnectionStatus } from '../ide/ide-client.js';

vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn(),
  },
  IDEConnectionStatus: {
    Connected: 'connected',
    Disconnected: 'disconnected',
  },
}));

vi.mock('../utils/llm-edit-fixer.js', () => ({
  FixLLMEditWithInstruction: mockFixLLMEditWithInstruction,
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    generateJson: mockGenerateJson,
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
  applyReplacement,
  SmartEditTool,
  type EditToolParams,
  calculateReplacement,
} from './smart-edit.js';
import { type FileDiff, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ApprovalMode, type Config } from '../config/config.js';
import { type Content, type Part, type SchemaUnion } from '@google/genai';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type { LlmUtilityService } from '../core/llmUtilityService.js';

describe('SmartEditTool', () => {
  let tool: SmartEditTool;
  let tempDir: string;
  let rootDir: string;
  let mockConfig: Config;
  let geminiClient: any;
  let llmUtilityService: LlmUtilityService;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-edit-tool-test-'));
    rootDir = path.join(tempDir, 'root');
    fs.mkdirSync(rootDir);

    geminiClient = {
      generateJson: mockGenerateJson,
    };

    llmUtilityService = {
      generateJson: mockGenerateJson,
    } as unknown as LlmUtilityService;

    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(geminiClient),
      getLlmUtilityService: vi.fn().mockReturnValue(llmUtilityService),
      getTargetDir: () => rootDir,
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getWorkspaceContext: () => createMockWorkspaceContext(rootDir),
      getFileSystemService: () => new StandardFileSystemService(),
      getIdeMode: () => false,
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
      getToolRegistry: () => ({}) as any,
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

        if (((schema as any).properties as any)?.corrected_target_snippet) {
          return Promise.resolve({
            corrected_target_snippet: problematicSnippet,
          });
        }
        if (((schema as any).properties as any)?.corrected_new_string) {
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

    tool = new SmartEditTool(mockConfig);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('applyReplacement', () => {
    it('should return newString if isNewFile is true', () => {
      expect(applyReplacement(null, 'old', 'new', true)).toBe('new');
      expect(applyReplacement('existing', 'old', 'new', true)).toBe('new');
    });

    it('should replace oldString with newString in currentContent', () => {
      expect(applyReplacement('hello old world old', 'old', 'new', false)).toBe(
        'hello new world new',
      );
    });
  });

  describe('calculateReplacement', () => {
    const abortSignal = new AbortController().signal;

    it('should perform an exact replacement', async () => {
      const content = 'hello world';
      const result = await calculateReplacement({
        params: {
          file_path: 'test.txt',
          instruction: 'test',
          old_string: 'world',
          new_string: 'moon',
        },
        currentContent: content,
        abortSignal,
      });
      expect(result.newContent).toBe('hello moon');
      expect(result.occurrences).toBe(1);
    });

    it('should perform a flexible, whitespace-insensitive replacement', async () => {
      const content = '  hello\n    world\n';
      const result = await calculateReplacement({
        params: {
          file_path: 'test.txt',
          instruction: 'test',
          old_string: 'hello\nworld',
          new_string: 'goodbye\nmoon',
        },
        currentContent: content,
        abortSignal,
      });
      expect(result.newContent).toBe('  goodbye\n  moon\n');
      expect(result.occurrences).toBe(1);
    });

    it('should return 0 occurrences if no match is found', async () => {
      const content = 'hello world';
      const result = await calculateReplacement({
        params: {
          file_path: 'test.txt',
          instruction: 'test',
          old_string: 'nomatch',
          new_string: 'moon',
        },
        currentContent: content,
        abortSignal,
      });
      expect(result.newContent).toBe(content);
      expect(result.occurrences).toBe(0);
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

    it('should return error for relative path', () => {
      const params: EditToolParams = {
        file_path: 'test.txt',
        instruction: 'An instruction',
        old_string: 'old',
        new_string: 'new',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });
  });

  describe('execute', () => {
    const testFile = 'execute_me.txt';
    let filePath: string;

    beforeEach(() => {
      filePath = path.join(rootDir, testFile);
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
        old_string: 'original text that is slightly wrong', // This will fail first
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

      expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_CHANGE);
      expect(result.llmContent).toMatch(/A secondary check determined/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(initialContent); // File is unchanged
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
        instruction: 'test',
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
        instruction: 'test',
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
        instruction: 'test',
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
        instruction: 'test',
        old_string: 'one',
        new_string: 'new',
      };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(
        ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
      );
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
        getConnectionStatus: vi.fn().mockReturnValue({
          status: IDEConnectionStatus.Connected,
        }),
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
});
