/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import type {
  Config,
  AgentDefinition,
  MessageBus,
} from '@google/gemini-cli-core';
import {
  FileDiscoveryService,
  GlobTool,
  ReadManyFilesTool,
  StandardFileSystemService,
  ToolRegistry,
  COMMON_IGNORE_PATTERNS,
} from '@google/gemini-cli-core';
import * as os from 'node:os';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

describe('handleAtCommand with Agents', () => {
  let testRootDir: string;
  let mockConfig: Config;

  const mockAddItem: UseHistoryManagerReturn['addItem'] = vi.fn();
  const mockOnDebugMessage: (message: string) => void = vi.fn();

  let abortController: AbortController;

  beforeEach(async () => {
    vi.resetAllMocks();

    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'agent-test-'),
    );

    abortController = new AbortController();

    const getToolRegistry = vi.fn();
    const mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    const mockAgentRegistry = {
      getDefinition: vi.fn((name: string) => {
        if (name === 'CodebaseInvestigator') {
          return {
            name: 'CodebaseInvestigator',
            description: 'Investigates codebase',
            kind: 'local',
          } as AgentDefinition;
        }
        return undefined;
      }),
    };

    mockConfig = {
      getToolRegistry,
      getTargetDir: () => testRootDir,
      isSandboxed: () => false,
      getExcludeTools: vi.fn(),
      getFileService: () => new FileDiscoveryService(testRootDir),
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getFileSystemService: () => new StandardFileSystemService(),
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getWorkspaceContext: () => ({
        isPathWithinWorkspace: () => true,
        getDirectories: () => [testRootDir],
      }),
      getMcpServers: () => ({}),
      getMcpServerCommand: () => undefined,
      getPromptRegistry: () => ({
        getPromptsByServer: () => [],
      }),
      getDebugMode: () => false,
      getFileExclusions: () => ({
        getCoreIgnorePatterns: () => COMMON_IGNORE_PATTERNS,
        getDefaultExcludePatterns: () => [],
        getGlobExcludes: () => [],
        buildExcludePatterns: () => [],
        getReadManyFilesExcludes: () => [],
      }),
      getUsageStatisticsEnabled: () => false,
      getEnableExtensionReloading: () => false,
      getResourceRegistry: () => ({
        findResourceByUri: () => undefined,
        getAllResources: () => [],
      }),
      getMcpClientManager: () => ({
        getClient: () => undefined,
      }),
      getAgentRegistry: () => mockAgentRegistry,
      getMessageBus: () => mockMessageBus,
    } as unknown as Config;

    const registry = new ToolRegistry(mockConfig, mockMessageBus);
    registry.registerTool(new ReadManyFilesTool(mockConfig, mockMessageBus));
    registry.registerTool(new GlobTool(mockConfig, mockMessageBus));
    getToolRegistry.mockReturnValue(registry);
  });

  afterEach(async () => {
    abortController.abort();
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
  });

  it('should detect agent reference and add nudge message', async () => {
    const query = 'Please help me @CodebaseInvestigator';

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 123,
      signal: abortController.signal,
    });

    expect(result.processedQuery).toBeDefined();
    const parts = result.processedQuery;

    if (!Array.isArray(parts)) {
      throw new Error('processedQuery should be an array');
    }

    // Check if the query text is preserved
    const firstPart = parts[0];
    if (
      typeof firstPart === 'object' &&
      firstPart !== null &&
      'text' in firstPart
    ) {
      expect((firstPart as { text: string }).text).toContain(
        'Please help me @CodebaseInvestigator',
      );
    } else {
      throw new Error('First part should be a text part');
    }

    // Check if the nudge message is added
    const nudgePart = parts.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'text' in p &&
        (p as { text: string }).text.includes('<system_note>'),
    );
    expect(nudgePart).toBeDefined();
    if (nudgePart && typeof nudgePart === 'object' && 'text' in nudgePart) {
      expect((nudgePart as { text: string }).text).toContain(
        'The user has explicitly selected the following agent(s): CodebaseInvestigator',
      );
    }
  });

  it('should handle multiple agents', async () => {
    // Mock another agent
    const mockAgentRegistry = mockConfig.getAgentRegistry() as {
      getDefinition: (name: string) => AgentDefinition | undefined;
    };
    mockAgentRegistry.getDefinition = vi.fn((name: string) => {
      if (name === 'CodebaseInvestigator' || name === 'AnotherAgent') {
        return { name, description: 'desc', kind: 'local' } as AgentDefinition;
      }
      return undefined;
    });

    const query = '@CodebaseInvestigator and @AnotherAgent';
    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });

    const parts = result.processedQuery;
    if (!Array.isArray(parts)) {
      throw new Error('processedQuery should be an array');
    }

    const nudgePart = parts.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'text' in p &&
        (p as { text: string }).text.includes('<system_note>'),
    );
    expect(nudgePart).toBeDefined();
    if (nudgePart && typeof nudgePart === 'object' && 'text' in nudgePart) {
      expect((nudgePart as { text: string }).text).toContain(
        'CodebaseInvestigator, AnotherAgent',
      );
    }
  });

  it('should not treat non-agents as agents', async () => {
    const query = '@UnknownAgent';
    // This should fail to resolve and fallback or error depending on file search
    // Since it's not a file, handleAtCommand logic for files will run.
    // It will likely log debug message about not finding file/glob.
    // But critical for this test: it should NOT add the agent nudge.

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    const parts = result.processedQuery;
    if (!Array.isArray(parts)) {
      throw new Error('processedQuery should be an array');
    }

    const nudgePart = parts.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'text' in p &&
        (p as { text: string }).text.includes('<system_note>'),
    );
    expect(nudgePart).toBeUndefined();
  });
});
