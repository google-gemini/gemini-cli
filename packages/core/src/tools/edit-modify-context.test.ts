/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFixLLMEditWithInstruction = vi.hoisted(() => vi.fn());
const mockGenerateJson = vi.hoisted(() => vi.fn());
const mockOpenDiff = vi.hoisted(() => vi.fn());

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
import { EditTool, type EditToolParams } from './edit.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ApprovalMode } from '../policy/types.js';
import { type Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

describe('EditTool - getModifyContext', () => {
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
      getDisableLLMCorrection: vi.fn(() => true),
      getExperiments: () => {},
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
      isPathAllowed(this: Config, _absolutePath: string): boolean {
        return true;
      },
      validatePathAccess(this: Config, _absolutePath: string): string | null {
        return null;
      },
    } as unknown as Config;

    (mockConfig.getApprovalMode as Mock).mockClear();
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);

    const bus = createMockMessageBus();
    getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
    tool = new EditTool(mockConfig, bus);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should use start_line when calculating proposed content', async () => {
    const testFile = 'modify_start_line.txt';
    const filePath = path.join(rootDir, testFile);
    // Create file with duplicates
    const content = ['match', 'match', 'match'].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const params: EditToolParams = {
      file_path: filePath,
      instruction: 'Replace 2nd match',
      old_string: 'match',
      new_string: 'replacement',
      start_line: 2,
    };

    const abortSignal = new AbortController().signal;
    const modifyContext = tool.getModifyContext(abortSignal);

    const proposed = await modifyContext.getProposedContent(params);

    // If it respects start_line (2), it should replace the 2nd match.
    // Expected: "match\nreplacement\nmatch" (if expected_replacements=1 limits it? No, calculateReplacement replaces all)
    // Actual implementation replaces all matches in the substring after start_line.
    // So both 2nd and 3rd matches are replaced.

    expect(proposed).toBe(['match', 'replacement', 'replacement'].join('\n'));
  });
});
