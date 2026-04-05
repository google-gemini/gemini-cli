/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { ContextManager } from './contextManager.js';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import type { Content } from '@google/genai';

expect.addSnapshotSerializer({
  test: (val) =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
  print: () => '"<UUID>"',
});

describe('ContextManager Golden Tests', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 2).getTime());
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  let mockConfig: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let contextManager: ContextManager;

  beforeEach(() => {
    mockConfig = {
      isContextManagementEnabled: vi.fn().mockReturnValue(true),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getToolOutputMaskingConfig: vi.fn().mockResolvedValue({
        enabled: true,
        minPrunableThresholdTokens: 50,
        protectLatestTurn: false,
        protectionThresholdTokens: 100,
      }),
      getContextManagementConfig: vi.fn().mockReturnValue({
        strategies: {
          historySquashing: { maxTokensPerNode: 3000 },
          toolMasking: { stringLengthThresholdTokens: 10000 },
          semanticCompression: {
            nodeThresholdTokens: 5000,
            compressionModel: 'chat-compression-2.5-flash-lite',
          },
        },
        budget: {
          maxTokens: 1000,
          retainedTokens: 500,
          protectedEpisodes: 1,
          protectSystemEpisode: true,
        },
        historyWindow: { maxTokens: 1000, retainedTokens: 500 },
        messageLimits: {
          normalMaxTokens: 100,
          retainedMaxTokens: 50,
          normalizationHeadRatio: 0.1,
        },
        tools: {
          outputMasking: {
            enabled: true,
            protectLatestTurn: false,
            protectionThresholdTokens: 100,
            minPrunableThresholdTokens: 50,
          },
        },
      }),
      storage: { getProjectTempDir: vi.fn().mockReturnValue('/tmp') },
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateJson: vi.fn().mockResolvedValue({
          'test_file.txt': { level: 'SUMMARY' },
        }),
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            { content: { parts: [{ text: 'This is a summary.' }] } },
          ],
        }),
      }),
    };

    contextManager = new ContextManager(
      mockConfig as Config,
      {} as unknown as GeminiClient,
    );
    
  });

  const createLargeHistory = (): Content[] => [
    {
      role: 'user',
      parts: [
        { text: 'A long long time ago, '.repeat(500) }, // Squashing target
      ],
    },
    {
      role: 'model',
      parts: [{ text: 'in a galaxy far far away...' }],
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'some_tool',
            response: { output: 'TOOL OUTPUT DATA '.repeat(500) }, // Masking target
          },
        },
      ],
    },
    {
      role: 'user',
      parts: [
        { text: '--- test_file.txt ---\n' + 'FILE DATA '.repeat(1000) }, // Semantic target
      ],
    },
  ];

  it('should process history and match golden snapshot', async () => {
    const history = createLargeHistory();
    (contextManager as any).pristineEpisodes = (
      await import('./ir/mapper.js')
    ).IrMapper.toIr(history);
    const result = await contextManager.projectCompressedHistory();
    expect(result).toMatchSnapshot();
  });

  it('should not modify history when under budget', async () => {
    mockConfig.getContextManagementConfig.mockReturnValue({
      strategies: {
        historySquashing: { maxTokensPerNode: 3000 },
        toolMasking: { stringLengthThresholdTokens: 10000 },
        semanticCompression: {
          nodeThresholdTokens: 5000,
          compressionModel: 'chat-compression-2.5-flash-lite',
        },
      },
      budget: {
        maxTokens: 15000000,
        retainedTokens: 50000,
        protectedEpisodes: 1,
        protectSystemEpisode: true,
      },
      historyWindow: { maxTokens: 100000, retainedTokens: 50000 },
      messageLimits: {
        normalMaxTokens: 100,
        retainedMaxTokens: 50,
        normalizationHeadRatio: 0.1,
      },
      tools: {
        outputMasking: {
          enabled: true,
          protectLatestTurn: false,
          protectionThresholdTokens: 100,
          minPrunableThresholdTokens: 50,
        },
      },
    });
    const history = createLargeHistory();
    (contextManager as any).pristineEpisodes = (
      await import('./ir/mapper.js')
    ).IrMapper.toIr(history);
    // In Golden Tests, we just want to ensure the logic doesn't throw or alter unprotected history in weird ways.
    // Since we're skipping processors due to being under budget, it should equal history.
    const result = await contextManager.projectCompressedHistory();
    expect(result.length).toEqual(history.length);
  });
});
