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
import type { WriteFileToolParams } from './write-file.js';
import { getCorrectedFileContent, WriteFileTool } from './write-file.js';
import { ToolErrorType } from './tool-error.js';
import type { FileDiff, ToolEditConfirmationDetails } from './tools.js';
import { ToolConfirmationOutcome } from './tools.js';
import { type EditToolParams } from './edit.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import type { ToolRegistry } from './tool-registry.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GeminiClient } from '../core/client.js';
import type { CorrectedEditResult } from '../utils/editCorrector.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';

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
const fsService = new StandardFileSystemService();
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getGeminiClient: vi.fn(), // Initialize as a plain mock function
  getFileSystemService: () => fsService,
  getIdeClient: vi.fn(),
  getIdeMode: vi.fn(() => false),
  getWorkspaceContext: () => createMockWorkspaceContext(rootDir),
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

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

// --- END MOCKS ---

describe('WriteFileTool', () => {
  let tool: WriteFileTool;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
    vi.mocked(ensureCorrectFileContent).mockImplementation(
      mockEnsureCorrectFileContent,
    );

    // Now that mockGeminiClientInstance is initialized, set the mock implementation for getGeminiClient
    mockConfigInternal.getGeminiClient.mockReturnValue(
      mockGeminiClientInstance,
    );
    mockConfigInternal.getIdeClient.mockReturnValue({
      openDiff: vi.fn(),
      closeDiff: vi.fn(),
      getIdeContext: vi.fn(),
      subscribeToIdeContext: vi.fn(),
      isCodeTrackerEnabled: vi.fn(),
      getTrackedCode: vi.fn(),
    });

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

  describe('build', () => {
    it('should return an invocation for a valid absolute path within root', () => {
      const params = {
        file_path: path.join(rootDir, 'test.txt'),
        content: 'hello',
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw an error for a relative path', () => {
      const params = { file_path: 'test.txt', content: 'hello' };
      expect(() => tool.build(params)).toThrow(/File path must be absolute/);
    });

    it('should throw an error for a path outside root', () => {
      const outsidePath = path.resolve(tempDir, 'outside-root.txt');
      const params = {
        file_path: outsidePath,
        content: 'hello',
      };
      expect(() => tool.build(params)).toThrow(
        /File path must be within one of the workspace directories/,
      );
    });

    it('should throw an error if path is a directory', () => {
      const dirAsFilePath = path.join(rootDir, 'a_directory');
      fs.mkdirSync(dirAsFilePath);
      const params = {
        file_path: dirAsFilePath,
        content: 'hello',
      };
      expect(() => tool.build(params)).toThrow(
        `Path is a directory, not a file: ${dirAsFilePath}`,
      );
    });

    it('should throw an error if the content is null', () => {
      const dirAsFilePath = path.join(rootDir, 'a_directory');
      fs.mkdirSync(dirAsFilePath);
      const params = {
        file_path: dirAsFilePath,
        content: null,
      } as unknown as WriteFileToolParams; // Intentionally non-conforming
      expect(() => tool.build(params)).toThrow('params/content must be string');
    });

    it('should throw error if the file_path is empty', () => {
      const dirAsFilePath = path.join(rootDir, 'a_directory');
      fs.mkdirSync(dirAsFilePath);
      const params = {
        file_path: '',
        content: '',
      };
      expect(() => tool.build(params)).toThrow(`Missing or empty "file_path"`);
    });
  });

  describe('getCorrectedFileContent', () => {
    it('should call ensureCorrectFileContent for a new file', async () => {
      const filePath = path.join(rootDir, 'new_corrected_file.txt');
      const proposedContent = 'Proposed new content.';
      const correctedContent = 'Corrected new content.';
      const abortSignal = new AbortController().signal;
      // Ensure the mock is set for this specific test case if needed, or rely on beforeEach
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      const result = await getCorrectedFileContent(
        mockConfig,
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

      const result = await getCorrectedFileContent(
        mockConfig,
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
      vi.spyOn(fsService, 'readTextFile').mockImplementationOnce(() =>
        Promise.reject(readError),
      );

      const result = await getCorrectedFileContent(
        mockConfig,
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(fsService.readTextFile).toHaveBeenCalledWith(filePath);
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.originalContent).toBe('');
      expect(result.fileExists).toBe(true);
      expect(result.error).toEqual({
        message: 'Permission denied',
        code: undefined,
      });

      fs.chmodSync(filePath, 0o600);
    });
  });

  describe('shouldConfirmExecute', () => {
    const abortSignal = new AbortController().signal;

    it('should return false if _getCorrectedFileContent returns an error', async () => {
      const filePath = path.join(rootDir, 'confirm_error_file.txt');
      const params = { file_path: filePath, content: 'test content' };
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      const readError = new Error('Simulated read error for confirmation');
      vi.spyOn(fsService, 'readTextFile').mockImplementationOnce(() =>
        Promise.reject(readError),
      );

      const invocation = tool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(abortSignal);
      expect(confirmation).toBe(false);

      fs.chmodSync(filePath, 0o600);
    });

    it('should request confirmation with diff for a new file (with corrected content)', async () => {
      const filePath = path.join(rootDir, 'confirm_new_file.txt');
      const proposedContent = 'Proposed new content for confirmation.';
      const correctedContent = 'Corrected new content for confirmation.';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent); // Ensure this mock is active

      const params = { file_path: filePath, content: proposedContent };
      const invocation = tool.build(params);
      const confirmation = (await invocation.shouldConfirmExecute(
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
      const invocation = tool.build(params);
      const confirmation = (await invocation.shouldConfirmExecute(
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

    it('should return error if _getCorrectedFileContent returns an error during execute', async () => {
      const filePath = path.join(rootDir, 'execute_error_file.txt');
      const params = { file_path: filePath, content: 'test content' };
      fs.writeFileSync(filePath, 'original', { mode: 0o000 });

      vi.spyOn(fsService, 'readTextFile').mockImplementationOnce(() => {
        const readError = new Error('Simulated read error for execute');
        return Promise.reject(readError);
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Error checking existing file');
      expect(result.returnDisplay).toMatch(
        /Error checking existing file: Simulated read error for execute/,
      );
      expect(result.error).toEqual({
        message:
          'Error checking existing file: Simulated read error for execute',
        type: ToolErrorType.FILE_WRITE_FAILURE,
      });

      fs.chmodSync(filePath, 0o600);
    });

    it('should write a new file with corrected content and return diff', async () => {
      const filePath = path.join(rootDir, 'execute_new_corrected_file.txt');
      const proposedContent = 'Proposed new content for execute.';
      const correctedContent = 'Corrected new content for execute.';
      mockEnsureCorrectFileContent.mockResolvedValue(correctedContent);

      const params = { file_path: filePath, content: proposedContent };
      const invocation = tool.build(params);

      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails &&
        confirmDetails.onConfirm
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await invocation.execute(abortSignal);

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.llmContent).toMatch(
        /Successfully created and wrote to new file/,
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const writtenContent = await fsService.readTextFile(filePath);
      expect(writtenContent).toBe(correctedContent);
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
      const invocation = tool.build(params);

      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails &&
        confirmDetails.onConfirm
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      const result = await invocation.execute(abortSignal);

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
      const writtenContent = await fsService.readTextFile(filePath);
      expect(writtenContent).toBe(correctedProposedContent);
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
      const invocation = tool.build(params);
      // Simulate confirmation if your logic requires it before execute, or remove if not needed for this path
      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails &&
        confirmDetails.onConfirm
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await invocation.execute(abortSignal);

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
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

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
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

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
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).not.toMatch(/User modified the `content`/);
    });
  });

  describe('workspace boundary validation', () => {
    it('should validate paths are within workspace root', () => {
      const params = {
        file_path: path.join(rootDir, 'file.txt'),
        content: 'test content',
      };
      expect(() => tool.build(params)).not.toThrow();
    });

    it('should reject paths outside workspace root', () => {
      const params = {
        file_path: '/etc/passwd',
        content: 'malicious',
      };
      expect(() => tool.build(params)).toThrow(
        /File path must be within one of the workspace directories/,
      );
    });
  });

  describe('specific error types for write failures', () => {
    const abortSignal = new AbortController().signal;

    it('should return PERMISSION_DENIED error when write fails with EACCES', async () => {
      const filePath = path.join(rootDir, 'permission_denied_file.txt');
      const content = 'test content';

      // Mock FileSystemService writeTextFile to throw EACCES error
      vi.spyOn(fsService, 'writeTextFile').mockImplementationOnce(() => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        return Promise.reject(error);
      });

      const params = { file_path: filePath, content };
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.PERMISSION_DENIED);
      expect(result.llmContent).toContain(
        `Permission denied writing to file: ${filePath} (EACCES)`,
      );
      expect(result.returnDisplay).toContain(
        `Permission denied writing to file: ${filePath} (EACCES)`,
      );
    });

    it('should return NO_SPACE_LEFT error when write fails with ENOSPC', async () => {
      const filePath = path.join(rootDir, 'no_space_file.txt');
      const content = 'test content';

      // Mock FileSystemService writeTextFile to throw ENOSPC error
      vi.spyOn(fsService, 'writeTextFile').mockImplementationOnce(() => {
        const error = new Error(
          'No space left on device',
        ) as NodeJS.ErrnoException;
        error.code = 'ENOSPC';
        return Promise.reject(error);
      });

      const params = { file_path: filePath, content };
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.NO_SPACE_LEFT);
      expect(result.llmContent).toContain(
        `No space left on device: ${filePath} (ENOSPC)`,
      );
      expect(result.returnDisplay).toContain(
        `No space left on device: ${filePath} (ENOSPC)`,
      );
    });

    it('should return TARGET_IS_DIRECTORY error when write fails with EISDIR', async () => {
      const dirPath = path.join(rootDir, 'test_directory');
      const content = 'test content';

      // Mock fs.existsSync to return false to bypass validation
      const originalExistsSync = fs.existsSync;
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        if (path === dirPath) {
          return false; // Pretend directory doesn't exist to bypass validation
        }
        return originalExistsSync(path as string);
      });

      // Mock FileSystemService writeTextFile to throw EISDIR error
      vi.spyOn(fsService, 'writeTextFile').mockImplementationOnce(() => {
        const error = new Error('Is a directory') as NodeJS.ErrnoException;
        error.code = 'EISDIR';
        return Promise.reject(error);
      });

      const params = { file_path: dirPath, content };
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.TARGET_IS_DIRECTORY);
      expect(result.llmContent).toContain(
        `Target is a directory, not a file: ${dirPath} (EISDIR)`,
      );
      expect(result.returnDisplay).toContain(
        `Target is a directory, not a file: ${dirPath} (EISDIR)`,
      );

      vi.spyOn(fs, 'existsSync').mockImplementation(originalExistsSync);
    });

    it('should return FILE_WRITE_FAILURE for generic write errors', async () => {
      const filePath = path.join(rootDir, 'generic_error_file.txt');
      const content = 'test content';

      // Ensure fs.existsSync is not mocked for this test
      vi.restoreAllMocks();

      // Mock FileSystemService writeTextFile to throw generic error
      vi.spyOn(fsService, 'writeTextFile').mockImplementationOnce(() =>
        Promise.reject(new Error('Generic write error')),
      );

      const params = { file_path: filePath, content };
      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
      expect(result.llmContent).toContain(
        'Error writing to file: Generic write error',
      );
      expect(result.returnDisplay).toContain(
        'Error writing to file: Generic write error',
      );
    });
  });
});
