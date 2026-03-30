/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiClient } from './client.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ApprovalMode } from '../policy/types.js';
import type { WatchmanProgress } from '../agents/types.js';

describe('GeminiClient Watchman Integration', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_SYSTEM_MD', '');
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should trigger watchman periodically when enabled', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'isExperimentalWatchmanEnabled').mockReturnValue(true);
    vi.spyOn(config, 'getExperimentalWatchmanInterval').mockReturnValue(2);
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
    const mockWatchmanTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          llmContent: JSON.stringify({
            userDirections: 'Stay on track',
            progressSummary: 'Making progress',
            evaluation: 'Good',
            feedback: 'You are doing great',
          } as WatchmanProgress),
        }),
      }),
      isReadOnly: true,
      name: 'watchman',
      displayName: 'Watchman',
      description: 'Watchman tool',
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getTool: vi.fn().mockImplementation((name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (name === 'watchman') return mockWatchmanTool as any;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watchman']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty((client as any).context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((client as any).context as any).agentRegistry = {
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

    // Manually increment sessionTurnCount to trigger watchman
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

    expect(mockWatchmanTool.build).toHaveBeenCalled();
    const history = client.getHistory();
    const feedbackMessage = history.find((m) =>
      m.parts?.some(
        (p) => 'text' in p && p.text?.includes('Feedback from Watchman'),
      ),
    );
    expect(feedbackMessage).toBeDefined();
    expect(feedbackMessage?.parts?.[0].text).toContain('You are doing great');
  });

  it('should NOT trigger watchman when NOT enabled', async () => {
    const config = makeFakeConfig();
    vi.spyOn(config, 'isExperimentalWatchmanEnabled').mockReturnValue(false);
    
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
    const mockWatchmanTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn(),
      }),
      isReadOnly: true,
      name: 'watchman',
    };

    const mockToolRegistry = {
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getTool: vi.fn().mockImplementation((name) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (name === 'watchman') return mockWatchmanTool as any;
        return undefined;
      }),
      getAllToolNames: vi.fn().mockReturnValue(['watchman']),
      sortTools: vi.fn(),
      discoverAllTools: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty((client as any).context, 'toolRegistry', {
      get: () => mockToolRegistry,
      configurable: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((client as any).context as any).agentRegistry = {
      getAllDefinitions: vi.fn().mockReturnValue([]),
    };

    await config.storage.initialize();
    await client.initialize();

    vi.spyOn(client as any, 'tryCompressChat').mockResolvedValue({
      compressionStatus: 'skipped',
    });
    vi.spyOn(client as any, '_getActiveModelForCurrentTurn').mockReturnValue(
      'gemini-pro',
    );

    (client as any).sessionTurnCount = 1;

    const promptId = 'test-prompt';
    const signal = new AbortController().signal;

    const generator = (client as any).processTurn(
      [{ text: 'test' }],
      signal,
      promptId,
      10,
      false,
    );
    for await (const _ of generator) {
      // Intentionally consume
    }

    expect(mockWatchmanTool.build).not.toHaveBeenCalled();
  });
});
;
