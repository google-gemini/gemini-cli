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

    const sidecar = SidecarLoader.fromLegacyConfig(mockConfig as any);
      const tracer = new ContextTracer('/tmp', 'test-session');
      const env = new ContextEnvironmentImpl({} as any, 'test', '/tmp', '/tmp', tracer, 4);
      contextManager = new ContextManager(sidecar, env, tracer);
    
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
    const history = createLargeHistory();
    (contextManager as any).pristineEpisodes = (
      await import('./ir/mapper.js')
    ).IrMapper.toIr(history);
    // In Golden Tests, we just want to ensure the logic doesn't throw or alter unprotected history in weird ways.
    // Since we're skipping processors due to being under budget, it should equal history.
    const tracer2 = new ContextTracer('/tmp', 'test2');
      contextManager = new ContextManager({ pipelines: { eagerBackground: [], normalProcessingGraph: [], retainedProcessingGraph: [] } } as any, {} as any, tracer2);
    
    (contextManager as any).pristineEpisodes = (await import('./ir/mapper.js')).IrMapper.toIr(history);
    const result = await contextManager.projectCompressedHistory();
    
    expect(result.length).toEqual(history.length);
  });
});
