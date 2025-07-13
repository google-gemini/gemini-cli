/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mocked,
} from 'vitest';
import { WriteFileTool } from './write-file.js';
import {
  FileDiff,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
} from './tools.js';
import { type EditToolParams } from './edit.js';
import { ApprovalMode, Config } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { GeminiClient } from '../core/client.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
  CorrectedEditResult,
} from '../utils/editCorrector.js';
import { FilePermissionService } from '../services/filePermissionService.js';
import type { PartListUnion } from '@google/genai';

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-test-root');

// Helper function
const getTextFromParts = (parts: PartListUnion | undefined): string => {
  if (!parts) return ""; let textContent = "";
  const partArray = Array.isArray(parts) ? parts : [parts];
  for (const part of partArray) {
    if (typeof part === 'string') { textContent += part; }
    else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') { textContent += part.text; }
  } return textContent;
};

// --- MOCKS ---
vi.mock('../core/client.js');
vi.mock('../utils/editCorrector.js');
vi.mock('../services/filePermissionService.js', () => ({
  FilePermissionService: vi.fn(() => ({
    canPerformOperation: vi.fn(),
    getRules: vi.fn(() => []),
  })),
}));

let mockGeminiClientInstance: Mocked<GeminiClient>;
const mockEnsureCorrectEdit = vi.fn<typeof ensureCorrectEdit>();
const mockEnsureCorrectFileContent = vi.fn<typeof ensureCorrectFileContent>();

// Wire up the mocked functions to be used by the actual module imports
vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
vi.mocked(ensureCorrectFileContent).mockImplementation(
  mockEnsureCorrectFileContent,
);

// Mock Config
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getGeminiClient: vi.fn(), // Initialize as a plain mock function
  getApiKey: () => 'test-key',
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
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
  getFilePermissionRules: vi.fn(() => []),
  getFilePermissionService: vi.fn(() => ({
    getRules: vi.fn(() => []),
    canPerformOperation: vi.fn(() => true),
  })),
};
const mockConfig = mockConfigInternal as unknown as Config;
// --- END MOCKS ---

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let tempDir: string;
  let mockFilePermissionService: Mocked<FilePermissionService>;

  beforeEach(() => {
    // Create a unique temporary directory for files created outside the root
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'write-file-test-external-'),
    );
    // Ensure the rootDir for the tool exists
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    // Setup GeminiClient mock
    mockGeminiClientInstance = new (vi.mocked(GeminiClient))(
      mockConfig,
    ) as Mocked<GeminiClient>;
    vi.mocked(GeminiClient).mockImplementation(() => mockGeminiClientInstance);

    // Now that mockGeminiClientInstance is initialized, set the mock implementation for getGeminiClient
    mockConfigInternal.getGeminiClient.mockReturnValue(
      mockGeminiClientInstance,
    );

    // Setup FilePermissionService mock
    mockFilePermissionService = new (vi.mocked(FilePermissionService))(mockConfig);
    mockConfigInternal.getFilePermissionService.mockReturnValue(mockFilePermissionService);


    tool = new WriteFileTool(mockConfig);

    // Reset mocks before each test
    mockConfigInternal.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    (mockFilePermissionService.canPerformOperation as vi.Mock).mockReturnValue(true); // Default to allow
    mockConfigInternal.setApprovalMode.mockClear();
    mockEnsureCorrectEdit.mockReset();
    mockEnsureCorrectFileContent.mockReset();

    // Default mock implementations that return valid structures
    mockEnsureCorrectEdit.mockImplementation(
      async (
        _currentContent: string,
        params: EditToolParams,
        _client: GeminiClient,
        signal?: AbortSignal, // Make AbortSignal optional to match usage
      ): Promise<CorrectedEditResult> => {
        if (signal?.aborted) {
          return Promise.reject(new Error('Aborted'));
        }
        return Promise.resolve({
          params: { ...params, new_string: params.new_string ?? '' },
          occurrences: 1,
        });
      },
    );
    mockEnsureCorrectFileContent.mockImplementation(
      async (
        content: string,
        _client: GeminiClient,
        signal?: AbortSignal,
      ): Promise<string> => {
        // Make AbortSignal optional
        if (signal?.aborted) {
          return Promise.reject(new Error('Aborted'));
        }
        return Promise.resolve(content ?? '');
      },
    );
  });

  afterEach(() => {
    // Clean up the temporary directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('validateToolParams', () => {
    it('should return null for valid absolute path within root', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params = { file_path: 'test.txt', content: 'hello' };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be absolute/,
      );
    });

    it('should return error for path outside root', () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = {
        file_path: outsidePath,
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toMatch(
        /File path must be within the root directory/,
      );
    });

    it('should return error if path is a directory', () => {
      const dirAsFilePath = path.join(rootDir, 'a_directory');
      fs.mkdirSync(dirAsFilePath);
      const params = {
        file_path: dirAsFilePath,
        content: 'hello',
      };
      expect(tool.validateToolParams(params)).toMatch(
        `Path is a directory, not a file: ${dirAsFilePath}`,
      );
    });
  });

  describe('_getCorrectedFileContent', () => {
    it('should call ensureCorrectFileContent for a new file', async () => {
      const filePath = path.join(rootDir, 'new_corrected_file.txt');
      const proposedContent = 'Proposed new content.';
      const correctedContent = 'Corrected new content.';
      const abortSignal = new AbortController().signal;

      const enoentError = new Error("ENOENT"); (enoentError as any).code = 'ENOENT';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(enoentError);

      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      // @ts-expect-error _getCorrectedFileContent is private
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(correctedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should call ensureCorrectEdit for an existing file', async () => {
      const filePath = path.join(rootDir, 'existing_corrected_file.txt');
      const originalContent = 'Original existing content.';
      const proposedContent = 'Proposed replacement content.';
      const correctedProposedContent = 'Corrected replacement content.';
      const abortSignal = new AbortController().signal;

      vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(originalContent);

      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      } as CorrectedEditResult);

      // @ts-expect-error _getCorrectedFileContent is private
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        originalContent,
        {
          old_string: originalContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(correctedProposedContent);
      expect(result.originalContent).toBe(originalContent);
      expect(result.fileExists).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error if reading an existing file fails (e.g. permissions)', async () => {
      const filePath = path.join(rootDir, 'unreadable_file.txt');
      const proposedContent = 'some content';
      const abortSignal = new AbortController().signal;

      const readError = new Error('Permission denied');
      (readError as any).code = 'EACCES';

      const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(readError);

      // @ts-expect-error _getCorrectedFileContent is private
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(readFileSpy).toHaveBeenCalledWith(filePath, 'utf8');
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(true);
      expect(result.error).toEqual({
        message: 'Permission denied',
        code: 'EACCES',
      });
    });
  });

  describe('shouldConfirmExecute', () => {
    const abortSignal = new AbortController().signal;
    it('should return false if params are invalid (relative path)', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);
    });

    it('should return false if params are invalid (outside root)', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);
    });

    it('should return false if _getCorrectedFileContent returns an error', async () => {
      const filePath = path.join(rootDir, 'confirm_error_file.txt');
      const params = { file_path: filePath, content: 'test content' };

      const readError = new Error('Simulated read error for confirmation');
      (readError as any).code = 'EACCES';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(readError);

      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);
    });

    it('should request confirmation with diff for a new file (with corrected content)', async () => {
      const filePath = path.join(rootDir, 'confirm_new_file.txt');
      const proposedContent = 'Proposed new content for confirmation.';
      const correctedContent = 'Corrected new content for confirmation.';

      const enoentError = new Error("ENOENT"); (enoentError as any).code = 'ENOENT';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(enoentError);
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      const params = { file_path: filePath, content: proposedContent };
      const confirmation = (await tool.shouldConfirmExecute(
        params,
        abortSignal,
      )) as ToolEditConfirmationDetails;

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Write: ${path.basename(filePath)}`,
          fileName: 'confirm_new_file.txt',
          fileDiff: expect.stringContaining(correctedContent),
        }),
      );
      expect(confirmation.fileDiff).toMatch(
        /--- confirm_new_file.txt\tCurrent/,
      );
      expect(confirmation.fileDiff).toMatch(
        /\+\+\+ confirm_new_file.txt\tProposed/,
      );
    });

    it('should request confirmation with diff for an existing file (with corrected content)', async () => {
      const filePath = path.join(rootDir, 'confirm_existing_file.txt');
      const originalContent = 'Original content for confirmation.';
      const proposedContent = 'Proposed replacement for confirmation.';
      const correctedProposedContent =
        'Corrected replacement for confirmation.';

      vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(originalContent);
      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };
      const confirmation = (await tool.shouldConfirmExecute(
        params,
        abortSignal,
      )) as ToolEditConfirmationDetails;

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        originalContent,
        {
          old_string: originalContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(confirmation).toEqual(
        expect.objectContaining({
          title: `Confirm Write: ${path.basename(filePath)}`,
          fileName: 'confirm_existing_file.txt',
          fileDiff: expect.stringContaining(correctedProposedContent),
        }),
      );
      expect(confirmation.fileDiff).toMatch(
        originalContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });
  });

  describe('execute', () => {
    const abortSignal = new AbortController().signal;
    it('should return error if params are invalid (relative path)', async () => {
      const params = { file_path: 'relative.txt', content: 'test' };
      const result = await tool.execute(params, abortSignal);
      expect(getTextFromParts(result.llmContent)).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/Error: File path must be absolute/);
    });

    it('should return error if params are invalid (path outside root)', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const result = await tool.execute(params, abortSignal);
      expect(getTextFromParts(result.llmContent)).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(
        /Error: File path must be within the root directory/,
      );
    });

    it('should return error if _getCorrectedFileContent returns an error during execute', async () => {
      const filePath = path.join(rootDir, 'execute_error_file.txt');
      const params = { file_path: filePath, content: 'test content' };

      const readError = new Error('Simulated read error for execute');
      (readError as any).code = 'EACCES';
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(readError);

      const result = await tool.execute(params, abortSignal);
      expect(getTextFromParts(result.llmContent)).toMatch(/Error checking existing file/);
      expect(result.returnDisplay).toMatch(
        /Error checking existing file: Simulated read error for execute/,
      );
    });

    it('should write a new file with corrected content and return diff', async () => {
      const filePath = path.join(rootDir, 'execute_new_corrected_file.txt');
      const proposedContent = 'Proposed new content for execute.';
      const correctedContent = 'Corrected new content for execute.';

      const enoentError = new Error("ENOENT"); (enoentError as any).code = 'ENOENT';
      vi.spyOn(fs, 'statSync').mockImplementation((p) => {
        if (p === filePath) throw enoentError;
        return { isDirectory: () => false } as fs.Stats;
      });
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(enoentError);
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);
      const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);


      const params = { file_path: filePath, content: proposedContent };

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(getTextFromParts(result.llmContent)).toMatch(
        /Successfully created and wrote to new file/,
      );
      expect(writeFileSpy).toHaveBeenCalledWith(filePath, correctedContent, 'utf8');
      const display = result.returnDisplay as FileDiff;
      expect(display.fileName).toBe('execute_new_corrected_file.txt');
      expect(display.fileDiff).toMatch(
        /--- execute_new_corrected_file.txt\tOriginal/,
      );
      expect(display.fileDiff).toMatch(
        /\+\+\+ execute_new_corrected_file.txt\tWritten/,
      );
      expect(display.fileDiff).toMatch(
        correctedContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });

    it('should overwrite an existing file with corrected content and return diff', async () => {
      const filePath = path.join(
        rootDir,
        'execute_existing_corrected_file.txt',
      );
      const initialContent = 'Initial content for execute.';
      const proposedContent = 'Proposed overwrite for execute.';
      const correctedProposedContent = 'Corrected overwrite for execute.';

      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      vi.spyOn(fs.promises, 'readFile').mockResolvedValue(initialContent);
      const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: initialContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        initialContent,
        {
          old_string: initialContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(getTextFromParts(result.llmContent)).toMatch(/Successfully overwrote file/);
      expect(writeFileSpy).toHaveBeenCalledWith(filePath, correctedProposedContent, 'utf8');
      const display = result.returnDisplay as FileDiff;
      expect(display.fileName).toBe('execute_existing_corrected_file.txt');
      expect(display.fileDiff).toMatch(
        initialContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
      expect(display.fileDiff).toMatch(
        correctedProposedContent.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'),
      );
    });

    it('should create directory if it does not exist', async () => {
      const dirPath = path.join(rootDir, 'new_dir_for_write');
      const filePath = path.join(dirPath, 'file_in_new_dir.txt');
      const content = 'Content in new directory';

      const enoentError = new Error("ENOENT"); (enoentError as any).code = 'ENOENT';
      vi.spyOn(fs, 'statSync').mockImplementation((p) => {
        if (p === filePath) throw enoentError;
        return { isDirectory: () => false } as fs.Stats;
      });
      vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(enoentError);
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const params = { file_path: filePath, content };
      await tool.execute(params, abortSignal);

      expect(mkdirSpy).toHaveBeenCalledWith(dirPath, { recursive: true });
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(filePath, content, 'utf8');
    });

    it('should include modification message when proposed content is modified', async () => {
      const filePath = path.join(rootDir, 'new_file_modified.txt');
      const content = 'New file content modified by user';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
        modified_by_user: true,
      };
      const result = await tool.execute(params, abortSignal);

      expect(getTextFromParts(result.llmContent)).toMatch(/User modified the content to be/);
    });

    it('should not include modification message when proposed content is not modified', async () => {
      const filePath = path.join(rootDir, 'new_file_unmodified.txt');
      const content = 'New file content not modified';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
        modified_by_user: false,
      };
      const result = await tool.execute(params, abortSignal);

      expect(getTextFromParts(result.llmContent)).not.toMatch(/User modified the content to be/);
    });

    it('should not include modification message when modified_by_user is not provided', async () => {
      const filePath = path.join(rootDir, 'new_file_unmodified.txt');
      const content = 'New file content not modified';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = {
        file_path: filePath,
        content,
      };
      const result = await tool.execute(params, abortSignal);

      expect(getTextFromParts(result.llmContent)).not.toMatch(/User modified the content to be/);
    });
  });
});
