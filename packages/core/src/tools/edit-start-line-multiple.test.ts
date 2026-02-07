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

describe('EditTool - Multiple Replacements with start_line', () => {
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

  it('should replace all occurrences after start_line for Exact strategy', async () => {
    const testFile = 'exact_multi.txt';
    const filePath = path.join(rootDir, testFile);
    const content = ['skip', 'match', 'match', 'skip'].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const params: EditToolParams = {
      file_path: filePath,
      instruction: 'Replace matches',
      old_string: 'match',
      new_string: 'replaced',
      start_line: 2,
      expected_replacements: 2,
    };

    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    const finalContent = fs.readFileSync(filePath, 'utf8');
    expect(finalContent).toBe(
      ['skip', 'replaced', 'replaced', 'skip'].join('\n'),
    );
  });

  it('should replace all occurrences after start_line for Flexible strategy', async () => {
    const testFile = 'flexible_multi.txt';
    const filePath = path.join(rootDir, testFile);
    // Flexible matches ignoring indentation
    const content = ['skip', '  match', '    match', 'skip'].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const params: EditToolParams = {
      file_path: filePath,
      instruction: 'Replace matches',
      old_string: 'match',
      new_string: 'replaced',
      start_line: 2,
      expected_replacements: 2,
    };

    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    const finalContent = fs.readFileSync(filePath, 'utf8');
    // Flexible strategy preserves indentation if it finds it?
    // "newBlockWithIndent = replaceLines.map(line => `${indentation}${line}`)"
    expect(finalContent).toBe(
      ['skip', '  replaced', '    replaced', 'skip'].join('\n'),
    );
  });

  it('should replace all occurrences after start_line for Regex strategy', async () => {
    const testFile = 'regex_multi.txt';
    const filePath = path.join(rootDir, testFile);
    const content = ['skip', 'match', 'match', 'skip'].join('\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const params: EditToolParams = {
      file_path: filePath,
      instruction: 'Replace matches',
      // Simple string behaves as regex too if exact fails? No, calculateRegexReplacement uses tokens.
      // But if I want to force regex usage, I should ensure exact/flexible fail?
      // Or simply invoke calculateRegexReplacement directly in a unit test of the function.
      // But here I am testing tool execution.
      // "match" will match Exact strategy first.
      // I need a pattern that fails Exact/Flexible but passes Regex.
      // Regex strategy handles flexible whitespace between tokens.
      // "match regex" matches line 3 EXACTLY, so Exact strategy wins and returns 1 match.
      // We want Regex strategy which finds 2 matches.
      // So we use "match  regex" (2 spaces) which doesn't exist exactly in the file.
      old_string: 'match  regex',
      new_string: 'replaced regex',
      start_line: 2,
      expected_replacements: 2,
    };

    const contentRegex = ['skip', 'match   regex', 'match regex', 'skip'].join(
      '\n',
    );
    fs.writeFileSync(filePath, contentRegex, 'utf8');

    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    const finalContent = fs.readFileSync(filePath, 'utf8');
    expect(finalContent).toBe(
      ['skip', 'replaced regex', 'replaced regex', 'skip'].join('\n'),
    );
  });
});
