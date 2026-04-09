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
import { ContextEnvironmentImpl } from './sidecar/environmentImpl.js';
import { SidecarLoader } from './sidecar/SidecarLoader.js';
import { ContextTracer } from './tracer.js';
import { ContextEventBus } from './eventBus.js';
import { PipelineOrchestrator } from './sidecar/orchestrator.js';
import { AgentChatHistory } from '../core/agentChatHistory.js';
import type { Content } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { Episode } from './ir/types.js';
import type { SidecarConfig } from './sidecar/types.js';
import { SidecarRegistry } from './sidecar/registry.js';
import { registerBuiltInProcessors } from './sidecar/builtins.js';
import { createMockContextConfig, setupContextComponentTest } from './testing/contextTestUtils.js';

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
      getExperimentalContextSidecarConfig: vi.fn().mockReturnValue(undefined),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getSessionId: vi.fn().mockReturnValue('test-session'),
      getToolOutputMaskingConfig: vi.fn().mockResolvedValue({
        enabled: true,
        minPrunableThresholdTokens: 50,
        protectLatestTurn: false,
        protectionThresholdTokens: 100,
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

    const registry = new SidecarRegistry();
    registerBuiltInProcessors(registry);

    const sidecar = SidecarLoader.fromConfig(mockConfig, registry);
    const tracer = new ContextTracer({
      targetDir: '/tmp',
      sessionId: 'test-session',
    });
    const eventBus = new ContextEventBus();
    const env = new ContextEnvironmentImpl(
      {
        generateContent: async () => ({}),
        generateJson: async () => ({}),
      } as unknown as BaseLlmClient,
      'test-prompt-id',
      'test',
      '/tmp',
      '/tmp',
      tracer,
      4,
      eventBus,
    );
    const chatHistory = new AgentChatHistory();
    const orchestrator = new PipelineOrchestrator(
      sidecar,
      env,
      eventBus,
      tracer,
      registry
    );

    contextManager = new ContextManager(
      sidecar,
      env,
      tracer,
      orchestrator,
      chatHistory
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
    // Use the actual public methods or carefully type the internal state for testing
    // To seed the manager purely for testing without invoking generateContent, we bypass the pipeline:
    const managerAsAny = contextManager as unknown as { 
      pristineEpisodes: Episode[]; 
      env: { irMapper: { toIr(h: unknown, t: unknown): Episode[] }, tokenCalculator: unknown } 
    };
    managerAsAny.pristineEpisodes = managerAsAny.env.irMapper.toIr(history, managerAsAny.env.tokenCalculator);
    
    const result = await contextManager.projectCompressedHistory();
    expect(result).toMatchSnapshot();
  });

  it('should not modify history when under budget', async () => {
    const history = createLargeHistory();

    const config = createMockContextConfig();
    const { chatHistory, contextManager: localManager } = setupContextComponentTest(config, {
        budget: { retainedTokens: 100000, maxTokens: 150000 },
        pipelines: [],
    } as unknown as SidecarConfig);

    chatHistory.set(history);

    const result = await localManager.projectCompressedHistory();

    // V2 adds an AgentYield node to the end of the history array
    expect(result.length).toEqual(history.length + 1);
  });
});
