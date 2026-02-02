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
import { detectLineEnding } from '../utils/textUtils.js';
import { WriteFileTool } from './write-file.js';
import { EditTool } from './edit.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import { ToolConfirmationOutcome } from './tools.js';
import type { ToolRegistry } from './tool-registry.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GeminiClient } from '../core/client.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import {
  ensureCorrectEdit,
  ensureCorrectFileContent,
} from '../utils/editCorrector.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-line-ending-test-root');

// --- MOCKS ---
vi.mock('../core/client.js');
vi.mock('../utils/editCorrector.js');
vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn().mockResolvedValue({
      openDiff: vi.fn(),
      isDiffingEnabled: vi.fn().mockReturnValue(false),
    }),
  },
}));

let mockGeminiClientInstance: Mocked<GeminiClient>;
let mockBaseLlmClientInstance: Mocked<BaseLlmClient>;
const mockEnsureCorrectEdit = vi.fn<typeof ensureCorrectEdit>();
const mockEnsureCorrectFileContent = vi.fn<typeof ensureCorrectFileContent>();

// Mock Config
const fsService = new StandardFileSystemService();
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getGeminiClient: vi.fn(),
  getBaseLlmClient: vi.fn(),
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
  getDisableLLMCorrection: vi.fn(() => false),
  validatePathAccess: vi.fn().mockReturnValue(null),
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
  isInteractive: () => false,
};
const mockConfig = mockConfigInternal as unknown as Config;

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
  logEditStrategy: vi.fn(),
  logEditCorrectionEvent: vi.fn(),
}));

// --- END MOCKS ---

describe('Line Ending Preservation', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'line-ending-test-external-'),
    );
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    mockGeminiClientInstance = new (vi.mocked(GeminiClient))(
      mockConfig,
    ) as Mocked<GeminiClient>;
    vi.mocked(GeminiClient).mockImplementation(() => mockGeminiClientInstance);

    mockBaseLlmClientInstance = {
      generateJson: vi.fn(),
    } as unknown as Mocked<BaseLlmClient>;

    vi.mocked(ensureCorrectEdit).mockImplementation(mockEnsureCorrectEdit);
    vi.mocked(ensureCorrectFileContent).mockImplementation(
      mockEnsureCorrectFileContent,
    );

    mockConfigInternal.getGeminiClient.mockReturnValue(
      mockGeminiClientInstance,
    );
    mockConfigInternal.getBaseLlmClient.mockReturnValue(
      mockBaseLlmClientInstance,
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('detectLineEnding', () => {
    it('should detect CRLF', () => {
      expect(detectLineEnding('line1\r\nline2')).toBe('\r\n');
      expect(detectLineEnding('line1\r\n')).toBe('\r\n');
    });

    it('should detect LF', () => {
      expect(detectLineEnding('line1\nline2')).toBe('\n');
      expect(detectLineEnding('line1\n')).toBe('\n');
      expect(detectLineEnding('line1')).toBe('\n'); // Default to LF if no newline
    });
  });

  describe('WriteFileTool', () => {
    let tool: WriteFileTool;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      const bus = createMockMessageBus();
      getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
      tool = new WriteFileTool(mockConfig, bus);
    });

    it('should preserve CRLF when overwriting an existing file', async () => {
      const filePath = path.join(rootDir, 'crlf_file.txt');
      const originalContent = 'line1\r\nline2\r\n';
      fs.writeFileSync(filePath, originalContent); // Write with CRLF (or however Node writes binary buffer)
      // Ensure strictly CRLF
      fs.writeFileSync(filePath, Buffer.from('line1\r\nline2\r\n'));

      // Proposed content from LLM (usually LF)
      const proposedContent = 'line1\nline2\nline3\n';

      // Mock corrections to return proposed content as-is (but usually normalized)
      mockEnsureCorrectEdit.mockResolvedValue({
        params: {
          file_path: filePath,
          old_string: originalContent,
          new_string: proposedContent,
        },
        occurrences: 1,
      });

      const params = { file_path: filePath, content: proposedContent };
      const invocation = tool.build(params);

      // Force approval
      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        confirmDetails &&
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await invocation.execute(abortSignal);

      const writtenContent = fs.readFileSync(filePath, 'utf8');
      // Expect all newlines to be CRLF
      expect(writtenContent).toBe('line1\r\nline2\r\nline3\r\n');
    });

    it('should use OS EOL for new files', async () => {
      const filePath = path.join(rootDir, 'new_os_eol_file.txt');
      const proposedContent = 'line1\nline2\n';

      mockEnsureCorrectFileContent.mockResolvedValue(proposedContent);

      const params = { file_path: filePath, content: proposedContent };
      const invocation = tool.build(params);

      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        confirmDetails &&
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await invocation.execute(abortSignal);

      const writtenContent = fs.readFileSync(filePath, 'utf8');

      if (os.EOL === '\r\n') {
        expect(writtenContent).toBe('line1\r\nline2\r\n');
      } else {
        expect(writtenContent).toBe('line1\nline2\n');
      }
    });
  });

  describe('EditTool', () => {
    let tool: EditTool;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      const bus = createMockMessageBus();
      getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
      tool = new EditTool(mockConfig, bus);
    });

    it('should preserve CRLF when editing a file', async () => {
      const filePath = path.join(rootDir, 'edit_crlf.txt');
      const originalContent = 'line1\r\nline2\r\nline3\r\n';
      fs.writeFileSync(filePath, Buffer.from(originalContent));

      const oldString = 'line2';
      const newString = 'modified';

      const params = {
        file_path: filePath,
        old_string: oldString,
        new_string: newString,
        instruction: 'Change line2 to modified',
      };
      const invocation = tool.build(params);

      // Force approval
      const confirmDetails = await invocation.shouldConfirmExecute(abortSignal);
      if (
        confirmDetails &&
        typeof confirmDetails === 'object' &&
        'onConfirm' in confirmDetails
      ) {
        await confirmDetails.onConfirm(ToolConfirmationOutcome.ProceedOnce);
      }

      await invocation.execute(abortSignal);

      const writtenContent = fs.readFileSync(filePath, 'utf8');

      expect(writtenContent).toBe('line1\r\nmodified\r\nline3\r\n');
    });
  });
});
