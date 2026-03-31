/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiClient } from './client.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { WatcherProgress } from '../agents/types.js';

describe('GeminiClient Watcher Integration', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should trigger watcher periodically when enabled', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'isExperimentalWatcherEnabled').mockReturnValue(true);
    vi.spyOn(config, 'getExperimentalWatcherInterval').mockReturnValue(2);
    vi.spyOn(config, 'getApprovalMode').mockReturnValue(ApprovalMode.DEFAULT);

    // Mock getContentGenerator
    const mockContentGenerator = {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockContentGenerator as any,
    );

    const client = new GeminiClient(config);

    // Mock toolRegistry before initialize calls startChat
    const mockWatcherTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          llmContent: JSON.stringify({
            userDirections: 'Stay on track',
            progressSummary: 'Making progress',
            evaluation: 'Good',
            feedback: 'You are doing great',
          } as WatcherProgress),
        }),
      }),
      isReadOnly: true,
      name: 'watcher',
      displayName: 'Watcher',
      description: 'Watcher tool',
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),

      getTool: vi.fn().mockImplementation((name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (name === 'watcher') return mockWatcherTool as any;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watcher']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty((client as any).context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).context.agentRegistry = {
      getAllDefinitions: vi.fn().mockReturnValue([]),
    };

    await config.storage.initialize();
    await client.initialize();

    // Mock sendMessageStream dependencies
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(client as any, 'tryCompressChat').mockResolvedValue({
      compressionStatus: 'skipped',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(client as any, '_getActiveModelForCurrentTurn').mockReturnValue(
      'gemini-pro',
    );

    // Manually increment sessionTurnCount to trigger watcher
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).sessionTurnCount = 1; // It will be 2 inside processTurn

    const promptId = 'test-prompt';
    const signal = new AbortController().signal;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generator = (client as any).processTurn(
      [{ text: 'test' }],
      signal,
      promptId,
      10,
      false,
    );

    // Consume the generator
    for await (const _ of generator) {
      // Intentionally consume
    }

    expect(mockWatcherTool.build).toHaveBeenCalled();
    const history = client.getHistory();
    const feedbackMessage = history.find((m) =>
      m.parts?.some(
        (p) => 'text' in p && p.text?.includes('Feedback from Watcher'),
      ),
    );
    expect(feedbackMessage).toBeDefined();
    expect(feedbackMessage?.parts?.[0].text).toContain('You are doing great');
  });

  it('should NOT trigger watcher when NOT enabled', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'isExperimentalWatcherEnabled').mockReturnValue(false);

    // Mock getContentGenerator
    const mockContentGenerator = {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockContentGenerator as any,
    );

    const client = new GeminiClient(config);

    // Mock toolRegistry before initialize calls startChat
    const mockWatcherTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn(),
      }),
      isReadOnly: true,
      name: 'watcher',
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),

      getTool: vi.fn().mockImplementation((name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (name === 'watcher') return mockWatcherTool as any;
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

    clientAccess.sessionTurnCount = 1;

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
});
