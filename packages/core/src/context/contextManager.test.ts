/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { ContextManager } from './contextManager.js';
import type { ContextProfile } from './config/profiles.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextTracer } from './tracer.js';
import type { PipelineOrchestrator } from './pipeline/orchestrator.js';
import type {
  AgentChatHistory,
  HistoryTurn,
} from '../core/agentChatHistory.js';
import type { AdvancedTokenCalculator } from './utils/contextTokenCalculator.js';
import { createMockEnvironment } from './testing/contextTestUtils.js';

describe('ContextManager', () => {
  let mockSidecar: ContextProfile;
  let mockEnv: ContextEnvironment;
  let mockTracer: ContextTracer;
  let mockOrchestrator: PipelineOrchestrator;
  let mockChatHistory: AgentChatHistory;
  let mockAdvancedTokenCalculator: AdvancedTokenCalculator;

  beforeEach(() => {
    vi.resetAllMocks();

    mockSidecar = {
      name: 'test-profile',
      config: { budget: { retainedTokens: 1000, maxTokens: 2000 } },
      buildPipelines: vi.fn().mockReturnValue([]),
      buildAsyncPipelines: vi.fn().mockReturnValue([]),
    } as unknown as ContextProfile;

    mockEnv = createMockEnvironment();
    mockTracer = mockEnv.tracer;

    mockOrchestrator = {
      setNodeProvider: vi.fn(),
      waitForPipelines: vi.fn().mockResolvedValue(undefined),
      executeTriggerSync: vi
        .fn()
        .mockImplementation(async (trigger, nodes) => nodes),
      shutdown: vi.fn(),
    } as unknown as PipelineOrchestrator;

    mockChatHistory = {
      all: vi.fn().mockReturnValue([]),
      last: vi.fn(),
      getById: vi.fn(),
      getTurnById: vi.fn(),
      getTurnsByIds: vi.fn(),
      getNeighboringTurns: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue([]),
      setHistory: vi.fn(),
      getHistoryTurns: vi.fn().mockReturnValue([]),
      getRawHistory: vi.fn().mockReturnValue([]),
      addTurn: vi.fn(),
      updateTurn: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      clear: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as AgentChatHistory;

    mockAdvancedTokenCalculator = {
      getRawBaseUnits: vi.fn().mockReturnValue(0),
      getRawBaseUnitsForContent: vi.fn().mockReturnValue(0),
      calculateTokensAndBaseUnits: vi
        .fn()
        .mockReturnValue({ tokens: 0, baseUnits: 0 }),
    } as unknown as AdvancedTokenCalculator;
  });

  it('renderHistory should process pendingRequest via the new_message pipeline', async () => {
    const contextManager = new ContextManager(
      mockSidecar,
      mockEnv,
      mockTracer,
      mockOrchestrator,
      mockChatHistory,
      mockAdvancedTokenCalculator,
    );

    const largeToolOutput = 'a'.repeat(10000);
    const pendingRequest: HistoryTurn = {
      id: 'pending-turn-1',
      content: {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'run_shell_command',
              response: {
                output: largeToolOutput,
              },
            },
          },
        ],
      },
    };

    await contextManager.renderHistory(pendingRequest);

    expect(mockOrchestrator.executeTriggerSync).toHaveBeenCalledExactlyOnceWith(
      'new_message',
      expect.any(Array),
      expect.any(Set),
    );

    // Check that the node passed to the orchestrator corresponds to our pendingRequest
    const call = (mockOrchestrator.executeTriggerSync as unknown as Mock).mock
      .calls[0];
    const passedNodes = call[1];
    const passedNodeIds = call[2];

    expect(passedNodes).toHaveLength(1);
    expect(passedNodes[0].type).toBe('TOOL_EXECUTION');
    expect(passedNodes[0].payload.functionResponse.response.output).toBe(
      largeToolOutput,
    );
    expect(passedNodeIds.has(passedNodes[0].id)).toBe(true);
  });

  it('renderHistory should exclude pendingRequest from the result (late binding)', async () => {
    const contextManager = new ContextManager(
      mockSidecar,
      mockEnv,
      mockTracer,
      mockOrchestrator,
      mockChatHistory,
      mockAdvancedTokenCalculator,
    );

    const pendingRequest: HistoryTurn = {
      id: 'pending-turn-1',
      content: { role: 'user', parts: [{ text: 'Active prompt' }] },
    };

    const { history, apiHistory } =
      await contextManager.renderHistory(pendingRequest);

    // Should be empty because mockChatHistory has no historical turns
    expect(history).toHaveLength(0);
    expect(apiHistory).toHaveLength(0);
  });
});
