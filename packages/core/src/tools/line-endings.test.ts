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
import { ensureCorrectFileContent } from '../utils/editCorrector.js';
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
  getActiveModel: () => 'test-model',
  validatePathAccess: vi.fn().mockReturnValue(null),
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
  isInteractive: () => false,
  isPlanMode: () => false,
  storage: {
    getPlansDir: () => '/tmp/plans',
  },
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

    it('should treat a mostly-LF file with a single stray CRLF as LF', () => {
      // A predominantly Unix-style file that picked up one pasted
      // Windows-style line (e.g. a partial conversion, or a snippet
      // pasted from a Windows editor) must not be classified as CRLF,
      // otherwise a single-line edit will rewrite every line ending in
      // the file.
      const mostlyLfOneStrayCrlf = 'line1\nline2\r\nline3\nline4\n';
      expect(detectLineEnding(mostlyLfOneStrayCrlf)).toBe('\n');
    });

    it('should still detect a pure CRLF file as CRLF (no regression)', () => {
      const pureCrlf = 'line1\r\nline2\r\nline3\r\n';
      expect(detectLineEnding(pureCrlf)).toBe('\r\n');
    });

    it('should treat lone CR (old-Mac style, no \\n at all) as LF', () => {
      // A file using bare '\r' as its line separator (classic Mac OS,
      // pre-OS X) contains no '\n' characters whatsoever, so it can't be
      // CRLF and falls back to LF - matching the old counting
      // implementation, which also returned '\n' here (totalNewlines === 0).
      const loneCr = 'line1\rline2\rline3\r';
      expect(detectLineEnding(loneCr)).toBe('\n');
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
      mockEnsureCorrectFileContent.mockResolvedValue(proposedContent);

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

      await invocation.execute({ abortSignal });

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

      await invocation.execute({ abortSignal });

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

      await invocation.execute({ abortSignal });

      const writtenContent = fs.readFileSync(filePath, 'utf8');

      expect(writtenContent).toBe('line1\r\nmodified\r\nline3\r\n');
    });

    it('should NOT convert a mostly-LF file to CRLF because of one stray CRLF line', async () => {
      const filePath = path.join(rootDir, 'edit_mixed.txt');
      // Mostly LF, with a single pasted Windows-style line mixed in -
      // e.g. a snippet copied from a Windows editor, or a partial
      // line-ending conversion that missed one line.
      const originalContent = 'line1\nline2\r\nline3\nline4\n';
      fs.writeFileSync(filePath, Buffer.from(originalContent));

      const oldString = 'line4';
      const newString = 'modified';

      const params = {
        file_path: filePath,
        old_string: oldString,
        new_string: newString,
        instruction: 'Change line4 to modified',
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

      await invocation.execute({ abortSignal });

      const writtenContent = fs.readFileSync(filePath, 'utf8');

      // The file must not be silently converted wholesale to CRLF just
      // because it contained a single stray CRLF line. The tool already
      // normalizes all line endings to LF internally before applying an
      // edit (see calculateEdit in edit.ts); with the file correctly
      // classified as LF, that normalization is never re-inflated back
      // to CRLF, so the result stays LF throughout. Before the fix, this
      // file was misclassified as CRLF and every line - including the
      // untouched line1 and line3 - was rewritten to CRLF.
      expect(writtenContent).toBe('line1\nline2\nline3\nmodified\n');
    });
  });
});
