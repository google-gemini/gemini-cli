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
import type {
  FileDiff,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { ToolConfirmationOutcome } from './tools.js';
import { type EditToolParams } from './edit.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { ToolRegistry } from './tool-registry.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GeminiClient } from '../core/client.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { CorrectedEditResult } from '../utils/editCorrector.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';
import { IdeClient } from '../ide/ide-client.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-test-root');

// --- MOCKS ---
vi.mock('../core/client.js');
vi.mock('../utils/editCorrector.js');
vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn(),
  },
}));
let mockGeminiClientInstance: Mocked<GeminiClient>;
let mockBaseLlmClientInstance: Mocked<BaseLlmClient>;
const mockEnsureCorrectEdit = vi.fn<typeof ensureCorrectEdit>();
const mockEnsureCorrectFileContent = vi.fn<typeof ensureCorrectFileContent>();
const mockIdeClient = {
  openDiff: vi.fn(),
  isDiffingEnabled: vi.fn(),
};

// Wire up the mocked functions to be used by the actual module imports
vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
vi.mocked(ensureCorrectFileContent).mockImplementation(
  mockEnsureCorrectFileContent,
);
vi.mocked(IdeClient.getInstance).mockResolvedValue(
  mockIdeClient as unknown as IdeClient,
);

// Mock Config
const fsService = new StandardFileSystemService();
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getGeminiClient: vi.fn(), // Initialize as a plain mock function
  getBaseLlmClient: vi.fn(), // Initialize as a plain mock function
  getFileSystemService: () => fsService,
  getIdeMode: vi.fn(() => false),
  getWorkspaceContext: () => new WorkspaceContext(rootDir),
  getApiKey: () => 'test-key',
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
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
  isInteractive: () => false,
  getDisableLLMCorrection: vi.fn(() => false),
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

    // Setup BaseLlmClient mock
    mockBaseLlmClientInstance = {
      generateJson: vi.fn(),
    } as unknown as Mocked<BaseLlmClient>;

    vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
    vi.mocked(ensureCorrectFileContent).mockImplementation(
      mockEnsureCorrectFileContent,
    );

    // Now that mock instances are initialized, set the mock implementations for config getters
    mockConfigInternal.getGeminiClient.mockReturnValue(
      mockGeminiClientInstance,
    );
    mockConfigInternal.getBaseLlmClient.mockReturnValue(
      mockBaseLlmClientInstance,
    );

    const bus = createMockMessageBus();
    getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
    tool = new WriteFileTool(mockConfig, bus);

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
        _baseClient: BaseLlmClient,
        signal?: AbortSignal,
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
        _baseClient: BaseLlmClient,
        signal?: AbortSignal,
      ): Promise<string> => {
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

    it('should return an invocation for a valid relative path within root', () => {
      const params = {
        file_path: 'test.txt',
        content: 'hello',
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
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
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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

    describe('with IDE integration', () => {
      beforeEach(() => {
        // Enable IDE mode and set connection status for these tests
        mockConfigInternal.getIdeMode.mockReturnValue(true);
        mockIdeClient.isDiffingEnabled.mockReturnValue(true);
        mockIdeClient.openDiff.mockResolvedValue({
          status: 'accepted',
          content: 'ide-modified-content',
        });
      });

      it('should call openDiff and await it when in IDE mode and connected', async () => {
        const filePath = path.join(rootDir, 'ide_confirm_file.txt');
        const params = { file_path: filePath, content: 'test' };
        const invocation = tool.build(params);

        const confirmation = (await invocation.shouldConfirmExecute(
          abortSignal,
        )) as ToolEditConfirmationDetails;

        expect(mockIdeClient.openDiff).toHaveBeenCalledWith(
          filePath,
          'test', // The corrected content
        );
        // Ensure the promise is awaited by checking the result
        expect(confirmation.ideConfirmation).toBeDefined();
        await confirmation.ideConfirmation; // Should resolve
      });

      it('should not call openDiff if not in IDE mode', async () => {
        mockConfigInternal.getIdeMode.mockReturnValue(false);
        const filePath = path.join(rootDir, 'ide_disabled_file.txt');
        const params = { file_path: filePath, content: 'test' };
        const invocation = tool.build(params);

        await invocation.shouldConfirmExecute(abortSignal);

        expect(mockIdeClient.openDiff).not.toHaveBeenCalled();
      });

      it('should not call openDiff if IDE is not connected', async () => {
        mockIdeClient.isDiffingEnabled.mockReturnValue(false);
        const filePath = path.join(rootDir, 'ide_disconnected_file.txt');
        const params = { file_path: filePath, content: 'test' };
        const invocation = tool.build(params);

        await invocation.shouldConfirmExecute(abortSignal);

        expect(mockIdeClient.openDiff).not.toHaveBeenCalled();
      });

      it('should update params.content with IDE content when onConfirm is called', async () => {
        const filePath = path.join(rootDir, 'ide_onconfirm_file.txt');
        const params = { file_path: filePath, content: 'original-content' };
        const invocation = tool.build(params);

        // This is the key part: get the confirmation details
        const confirmation = (await invocation.shouldConfirmExecute(
          abortSignal,
        )) as ToolEditConfirmationDetails;

        // The `onConfirm` function should exist on the details object
        expect(confirmation.onConfirm).toBeDefined();

        // Call `onConfirm` to trigger the logic that updates the content
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedOnce);

        // Now, check if the original `params` object (captured by the invocation) was modified
        expect(invocation.params.content).toBe('ide-modified-content');
      });

      it('should not await ideConfirmation promise', async () => {
        const IDE_DIFF_DELAY_MS = 50;
        const filePath = path.join(rootDir, 'ide_no_await_file.txt');
        const params = { file_path: filePath, content: 'test' };
        const invocation = tool.build(params);

        let diffPromiseResolved = false;
        const diffPromise = new Promise<DiffUpdateResult>((resolve) => {
          setTimeout(() => {
            diffPromiseResolved = true;
            resolve({ status: 'accepted', content: 'ide-modified-content' });
          }, IDE_DIFF_DELAY_MS);
        });
        mockIdeClient.openDiff.mockReturnValue(diffPromise);

        const confirmation = (await invocation.shouldConfirmExecute(
          abortSignal,
        )) as ToolEditConfirmationDetails;

        // This is the key check: the confirmation details should be returned
        // *before* the diffPromise is resolved.
        expect(diffPromiseResolved).toBe(false);
        expect(confirmation).toBeDefined();
        expect(confirmation.ideConfirmation).toBe(diffPromise);

        // Now, we can await the promise to let the test finish cleanly.
        await diffPromise;
        expect(diffPromiseResolved).toBe(true);
      });
    });
  });

  describe('execute', () => {
    const abortSignal = new AbortController().signal;

    async function confirmExecution(
      invocation: ToolInvocation<WriteFileToolParams, ToolResult>,
      signal: AbortSignal = abortSignal,
    ) {
      const confirmDetails = await invocation.shouldConfirmExecute(signal);
      if (
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails &&
        confirmDetails.onConfirm
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }
    }

    it('should write a new file with a relative path', async () => {
      const relativePath = 'execute_relative_new_file.txt';
      const filePath = path.join(rootDir, relativePath);
      const content = 'Content for relative path file.';
      mockEnsureCorrectFileContent.mockResolvedValue(content);

      const params = { file_path: relativePath, content };
      const invocation = tool.build(params);

      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toMatch(
        /Successfully created and wrote to new file/,
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const writtenContent = await fsService.readTextFile(filePath);
      expect(writtenContent).toBe(content);
    });

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

      await confirmExecution(invocation);

      const result = await invocation.execute(abortSignal);

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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

      await confirmExecution(invocation);

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
        mockBaseLlmClientInstance,
        abortSignal,
        false,
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

      await confirmExecution(invocation);

      await invocation.execute(abortSignal);

      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it.each([
      {
        modified_by_user: true,
        shouldIncludeMessage: true,
        testCase: 'when modified_by_user is true',
      },
      {
        modified_by_user: false,
        shouldIncludeMessage: false,
        testCase: 'when modified_by_user is false',
      },
      {
        modified_by_user: undefined,
        shouldIncludeMessage: false,
        testCase: 'when modified_by_user is not provided',
      },
    ])(
      'should $testCase include modification message',
      async ({ modified_by_user, shouldIncludeMessage }) => {
        const filePath = path.join(rootDir, `new_file_${modified_by_user}.txt`);
        const content = 'New file content';
        mockEnsureCorrectFileContent.mockResolvedValue(content);

        const params: WriteFileToolParams = {
          file_path: filePath,
          content,
          ...(modified_by_user !== undefined && { modified_by_user }),
        };
        const invocation = tool.build(params);
        const result = await invocation.execute(abortSignal);

        if (shouldIncludeMessage) {
          expect(result.llmContent).toMatch(/User modified the `content`/);
        } else {
          expect(result.llmContent).not.toMatch(/User modified the `content`/);
        }
      },
    );
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

    it.each([
      {
        errorCode: 'EACCES',
        errorType: ToolErrorType.PERMISSION_DENIED,
        errorMessage: 'Permission denied',
        expectedMessagePrefix: 'Permission denied writing to file',
        mockFsExistsSync: false,
        restoreAllMocks: false,
      },
      {
        errorCode: 'ENOSPC',
        errorType: ToolErrorType.NO_SPACE_LEFT,
        errorMessage: 'No space left on device',
        expectedMessagePrefix: 'No space left on device',
        mockFsExistsSync: false,
        restoreAllMocks: false,
      },
      {
        errorCode: 'EISDIR',
        errorType: ToolErrorType.TARGET_IS_DIRECTORY,
        errorMessage: 'Is a directory',
        expectedMessagePrefix: 'Target is a directory, not a file',
        mockFsExistsSync: true,
        restoreAllMocks: false,
      },
      {
        errorCode: undefined,
        errorType: ToolErrorType.FILE_WRITE_FAILURE,
        errorMessage: 'Generic write error',
        expectedMessagePrefix: 'Error writing to file',
        mockFsExistsSync: false,
        restoreAllMocks: true,
      },
    ])(
      'should return $errorType error when write fails with $errorCode',
      async ({
        errorCode,
        errorType,
        errorMessage,
        expectedMessagePrefix,
        mockFsExistsSync,
        restoreAllMocks,
      }) => {
        const filePath = path.join(rootDir, `${errorType}_file.txt`);
        const content = 'test content';

        if (restoreAllMocks) {
          vi.restoreAllMocks();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let existsSyncSpy: any;

        try {
          if (mockFsExistsSync) {
            const originalExistsSync = fs.existsSync;
            existsSyncSpy = vi
              .spyOn(fs, 'existsSync')
              .mockImplementation((path) =>
                path === filePath ? false : originalExistsSync(path as string),
              );
          }

          vi.spyOn(fsService, 'writeTextFile').mockImplementationOnce(() => {
            const error = new Error(errorMessage) as NodeJS.ErrnoException;
            if (errorCode) error.code = errorCode;
            return Promise.reject(error);
          });

          const params = { file_path: filePath, content };
          const invocation = tool.build(params);
          const result = await invocation.execute(abortSignal);

          expect(result.error?.type).toBe(errorType);
          const errorSuffix = errorCode ? ` (${errorCode})` : '';
          const expectedMessage = errorCode
            ? `${expectedMessagePrefix}: ${filePath}${errorSuffix}`
            : `${expectedMessagePrefix}: ${errorMessage}`;
          expect(result.llmContent).toContain(expectedMessage);
          expect(result.returnDisplay).toContain(expectedMessage);
        } finally {
          if (existsSyncSpy) {
            existsSyncSpy.mockRestore();
          }
        }
      },
    );
  });

  describe('disableLLMCorrection', () => {
    const abortSignal = new AbortController().signal;

    it('should call ensureCorrectFileContent with disableLLMCorrection=true for a new file when disabled', async () => {
      const filePath = path.join(rootDir, 'new_file_no_correction.txt');
      const proposedContent = 'Proposed content.';

      mockConfigInternal.getDisableLLMCorrection.mockReturnValue(true);
      // Ensure the mock returns the content passed to it (simulating no change or unescaped change)
      mockEnsureCorrectFileContent.mockResolvedValue(proposedContent);

      const result = await getCorrectedFileContent(
        mockConfig,
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectFileContent).toHaveBeenCalledWith(
        proposedContent,
        mockBaseLlmClientInstance,
        abortSignal,
        true,
      );
      expect(mockEnsureCorrectEdit).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.fileExists).toBe(false);
    });

    it('should call ensureCorrectEdit with disableLLMCorrection=true for an existing file when disabled', async () => {
      const filePath = path.join(rootDir, 'existing_file_no_correction.txt');
      const originalContent = 'Original content.';
      const proposedContent = 'Proposed content.';
      fs.writeFileSync(filePath, originalContent, 'utf8');

      mockConfigInternal.getDisableLLMCorrection.mockReturnValue(true);
      // Ensure the mock returns the content passed to it
      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: proposedContent,
        },
        occurrences: 1,
      });

      const result = await getCorrectedFileContent(
        mockConfig,
        filePath,
        proposedContent,
        abortSignal,
      );

      expect(mockEnsureCorrectEdit).toHaveBeenCalledWith(
        filePath,
        originalContent,
        expect.anything(), // params object
        mockGeminiClientInstance,
        mockBaseLlmClientInstance,
        abortSignal,
        true,
      );
      expect(mockEnsureCorrectFileContent).not.toHaveBeenCalled();
      expect(result.correctedContent).toBe(proposedContent);
      expect(result.originalContent).toBe(originalContent);
      expect(result.fileExists).toBe(true);
    });
  });
});
