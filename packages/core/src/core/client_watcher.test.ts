/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GeminiClient } from './client.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { WatcherProgress } from '../agents/types.js';
import type { Config } from '../config/config.js';

describe('GeminiClient Watcher Integration', () => {
  let config: Config;
  let client: GeminiClient;
  let mockContentGenerator: {
    countTokens: ReturnType<typeof vi.fn>;
    generateContentStream: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');
    config = makeFakeConfig();

    mockContentGenerator = {
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 10 }),
      generateContentStream: vi.fn().mockReturnValue({
        stream: (async function* () {
          yield {
            response: {
              candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
            },
          };
        })(),
      }),
    };
    vi.spyOn(config, 'getContentGenerator').mockReturnValue(
      mockContentGenerator as unknown as ReturnType<
        typeof config.getContentGenerator
      >,
    );

    client = new GeminiClient(config as unknown as AgentLoopContext);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    const projectTempDir = config.storage.getProjectTempDir();
    const statusFilePath = path.join(projectTempDir, 'watcher_status.md');
    if (fs.existsSync(statusFilePath)) {
      fs.unlinkSync(statusFilePath);
    }
  });

  it('should trigger watcher periodically when enabled', async () => {
    vi.spyOn(config, 'isExperimentalWatcherEnabled').mockReturnValue(true);
    vi.spyOn(config, 'getExperimentalWatcherInterval').mockReturnValue(2);
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.DEFAULT);

    // Mock toolRegistry before initialize calls startChat
    const mockWatcherTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          llmContent: [
            {
              text: JSON.stringify({
                userDirections: 'Keep testing',
                progressSummary: 'Test in progress',
                evaluation: 'Good',
                feedback: 'Keep going',
              } as WatcherProgress),
            },
          ],
        }),
      }),
      name: 'watcher',
      displayName: 'Watcher',
      description: 'Watcher tool',
      inputConfig: {
        inputSchema: {},
      },
      outputConfig: {
        outputName: 'report',
        schema: {},
      },
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockImplementation((name) => {
        if (name === 'watcher') return mockWatcherTool;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watcher']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };

    // Use type assertion for testing purposes to access protected members
    const clientAccess = client as unknown as {
      context: AgentLoopContext;
      sessionTurnCount: number;
      tryCompressChat: () => Promise<{ compressionStatus: string }>;
      _getActiveModelForCurrentTurn: () => string;
      processTurn: (
        request: unknown,
        signal: AbortSignal,
        promptId: string,
        maxTokens: number,
        forceFullContext: boolean,
      ) => AsyncGenerator;
    };

    Object.defineProperty(clientAccess.context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    (
      clientAccess.context as unknown as { agentRegistry: unknown }
    ).agentRegistry = {
      getAllDefinitions: vi.fn().mockReturnValue([]),
    };

    await config.storage.initialize();
    await client.initialize();

    vi.spyOn(clientAccess, 'tryCompressChat').mockResolvedValue({
      compressionStatus: 'skipped',
    });
    vi.spyOn(clientAccess, '_getActiveModelForCurrentTurn').mockReturnValue(
      'gemini-pro',
    );

    clientAccess.sessionTurnCount = 0; // Will become 1 inside processTurn

    const promptId = 'test-prompt';
    const signal = new AbortController().signal;

    const generator = clientAccess.processTurn(
      [{ text: 'test' }],
      signal,
      promptId,
      10,
      false,
    );
    for await (const _ of generator) {
      // Intentionally consume
    }

    expect(mockWatcherTool.build).toHaveBeenCalled();
  });

  it('should NOT trigger watcher when NOT enabled', async () => {
    vi.spyOn(config, 'isExperimentalWatcherEnabled').mockReturnValue(false);
    vi.spyOn(config, 'getExperimentalWatcherInterval').mockReturnValue(2);
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.DEFAULT);

    // Mock toolRegistry before initialize calls startChat
    const mockWatcherTool = {
      build: vi.fn(),
      name: 'watcher',
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockImplementation((name) => {
        if (name === 'watcher') return mockWatcherTool;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watcher']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };

    // Use type assertion for testing purposes to access protected members
    const clientAccess = client as unknown as {
      context: AgentLoopContext;
      sessionTurnCount: number;
      tryCompressChat: () => Promise<{ compressionStatus: string }>;
      _getActiveModelForCurrentTurn: () => string;
      processTurn: (
        request: unknown,
        signal: AbortSignal,
        promptId: string,
        maxTokens: number,
        forceFullContext: boolean,
      ) => AsyncGenerator;
    };

    Object.defineProperty(clientAccess.context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    (
      clientAccess.context as unknown as { agentRegistry: unknown }
    ).agentRegistry = {
      getAllDefinitions: vi.fn().mockReturnValue([]),
    };

    await config.storage.initialize();
    await client.initialize();

    vi.spyOn(clientAccess, 'tryCompressChat').mockResolvedValue({
      compressionStatus: 'skipped',
    });
    vi.spyOn(clientAccess, '_getActiveModelForCurrentTurn').mockReturnValue(
      'gemini-pro',
    );

    clientAccess.sessionTurnCount = 0; // Will become 1 inside processTurn

    const promptId = 'test-prompt';
    const signal = new AbortController().signal;

    const generator = clientAccess.processTurn(
      [{ text: 'test' }],
      signal,
      promptId,
      10,
      false,
    );
    for await (const _ of generator) {
      // Intentionally consume
    }

    expect(mockWatcherTool.build).not.toHaveBeenCalled();
  });

  it('should trigger watcher multiple times in a long conversation and update status file', async () => {
    const interval = 5;
    vi.spyOn(config, 'isExperimentalWatcherEnabled').mockReturnValue(true);
    vi.spyOn(config, 'getExperimentalWatcherInterval').mockReturnValue(
      interval,
    );
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.DEFAULT);

    const mockWatcherTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          llmContent: [
            {
              text: JSON.stringify({
                userDirections: 'Keep testing',
                progressSummary: 'Test in progress',
                evaluation: 'Good',
                feedback: 'Keep going',
              } as WatcherProgress),
            },
          ],
        }),
      }),
      name: 'watcher',
      displayName: 'Watcher',
      description: 'Watcher tool',
      inputConfig: {
        inputName: 'history',
        description: 'history',
        schema: {},
      },
      outputConfig: {
        outputName: 'report',
        description: 'report',
        schema: {},
      },
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockImplementation((name) => {
        if (name === 'watcher') return mockWatcherTool;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watcher']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };

    // Use type assertion for testing purposes to access protected members
    const clientAccess = client as unknown as {
      context: AgentLoopContext;
      sessionTurnCount: number;
      tryCompressChat: () => Promise<{ compressionStatus: string }>;
      _getActiveModelForCurrentTurn: () => string;
      processTurn: (
        request: unknown,
        signal: AbortSignal,
        promptId: string,
        maxTokens: number,
        forceFullContext: boolean,
      ) => AsyncGenerator;
    };

    Object.defineProperty(clientAccess.context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    (
      clientAccess.context as unknown as { agentRegistry: unknown }
    ).agentRegistry = {
      getAllDefinitions: vi.fn().mockReturnValue([]),
    };

    await config.storage.initialize();
    await client.initialize();

    vi.spyOn(clientAccess, 'tryCompressChat').mockResolvedValue({
      compressionStatus: 'skipped',
    });
    vi.spyOn(clientAccess, '_getActiveModelForCurrentTurn').mockReturnValue(
      'gemini-pro',
    );

    const promptId = 'test-prompt';
    const signal = new AbortController().signal;

    // Simulate 11 turns
    for (let i = 1; i <= 11; i++) {
      clientAccess.sessionTurnCount = i - 1; // Will become i inside processTurn
      // In a real scenario, the subagent would write this file via WRITE_FILE_TOOL.
      // We simulate this side effect here when the watcher is triggered.
      if (i % interval === 0) {
        const projectTempDir = config.storage.getProjectTempDir();
        const statusFilePath = path.join(projectTempDir, 'watcher_status.md');
        fs.writeFileSync(
          statusFilePath,
          '# Watcher Status Update\nDummy status',
        );
      }

      const generator = clientAccess.processTurn(
        [{ text: `turn ${i}` }],
        signal,
        promptId,
        10,
        false,
      );
      for await (const _ of generator) {
        // consume
      }
    }

    // With interval 5, it should trigger at turn 1, turn 5 and turn 10
    expect(mockWatcherTool.build).toHaveBeenCalledTimes(3);

    // Verify the status file exists
    const projectTempDir = config.storage.getProjectTempDir();
    const statusFilePath = path.join(projectTempDir, 'watcher_status.md');
    expect(fs.existsSync(statusFilePath)).toBe(true);
    const content = fs.readFileSync(statusFilePath, 'utf-8');
    expect(content).toContain('Watcher Status Update');
  });
});
