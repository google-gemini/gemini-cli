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

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-test-root');

// --- MOCKS ---
vi.mock('../core/client.js');
vi.mock('../utils/editCorrector.js');

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
};
const mockConfig = mockConfigInternal as unknown as Config;
// --- END MOCKS ---

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let tempDir: string;

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

    tool = new WriteFileTool(mockConfig);

    // Reset mocks before each test
    mockConfigInternal.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    mockConfigInternal.setApprovalMode.mockClear();
    mockEnsureCorrectEdit.mockReset();
    mockEnsureCorrectFileContent.mockReset();

    // Default mock implementations that return valid structures
    mockEnsureCorrectEdit.mockImplementation(
      async (
        filePath: string,
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
      // Ensure the mock is set for this specific test case if needed, or rely on beforeEach
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
      fs.writeFileSync(filePath, originalContent, 'utf8');

      // Ensure this mock is active and returns the correct structure
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
        filePath,
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
      fs.writeFileSync(filePath, 'content', { mode: 0o000 });

      const readError = new Error('Permission denied');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      // @ts-expect-error _getCorrectedFileContent is private
      const result = await tool._getCorrectedFileContent(
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(true);
      expect(result.error).toEqual({
        message: 'Permission denied',
        code: undefined,
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
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
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      const readError = new Error('Simulated read error for confirmation');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      expect(confirmation).toBe(false);

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
    });

    it('should request confirmation with diff for a new file (with corrected content)', async () => {
      const filePath = path.join(rootDir, 'confirm_new_file.txt');
      const proposedContent = 'Proposed new content for confirmation.';
      const correctedContent = 'Corrected new content for confirmation.';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent); // Ensure this mock is active

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
      fs.writeFileSync(filePath, originalContent, 'utf8');

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
        filePath,
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
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(/Error: File path must be absolute/);
    });

    it('should return error if params are invalid (path outside root)', async () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = { file_path: outsidePath, content: 'test' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/Error: Invalid parameters provided/);
      expect(result.returnDisplay).toMatch(
        /Error: File path must be within the root directory/,
      );
    });

    it('should return error if _getCorrectedFileContent returns an error during execute', async () => {
      const filePath = path.join(rootDir, 'execute_error_file.txt');
      const params = { file_path: filePath, content: 'test content' };
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      const readError = new Error('Simulated read error for execute');
      const originalReadFileSync = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw readError;
      });

      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(/Error checking existing file/);
      expect(result.returnDisplay).toMatch(
        /Error checking existing file: Simulated read error for execute/,
      );

      vi.spyOn(fs, 'readFileSync').mockImplementation(originalReadFileSync);
      fs.chmodSync(filePath, 0o600);
    });

    it('should write a new file with corrected content and return diff', async () => {
      const filePath = path.join(rootDir, 'execute_new_corrected_file.txt');
      const proposedContent = 'Proposed new content for execute.';
      const correctedContent = 'Corrected new content for execute.';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      const params = { file_path: filePath, content: proposedContent };

      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.llmContent).toMatch(
        /Successfully created and wrote to new file/,
      );
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(correctedContent);
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
      fs.writeFileSync(filePath, initialContent, 'utf8');

      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: initialContent,
          new_string: correctedProposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };

      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await tool.execute(params, abortSignal);

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        filePath,
        initialContent,
        {
          old_string: initialContent,
          new_string: proposedContent,
          file_path: filePath,
        },
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.llmContent).toMatch(/Successfully overwrote file/);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(correctedProposedContent);
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
      mockEnsureCorrectFileContent.mockResolvedValue(content); // Ensure this mock is active

      const params = { file_path: filePath, content };
      // Simulate confirmation if your logic requires it before execute, or remove if not needed for this path
      const confirmDetails = await tool.shouldConfirmExecute(
        params,
        abortSignal,
      );
      if (typeof confirmDetails === 'object' && confirmDetails.onConfirm) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await tool.execute(params, abortSignal);

      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
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

      expect(result.llmContent).toMatch(/User modified the `content`/);
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

      expect(result.llmContent).not.toMatch(/User modified the `content`/);
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

      expect(result.llmContent).not.toMatch(/User modified the `content`/);
    });
  });
});
