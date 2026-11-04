/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextManager } from './contextManager.js';
import {
  createMockEnvironment,
  createDummyNode,
} from './testing/contextTestUtils.js';
import type { ContextProfile } from './config/profiles.js';
import { NodeType, type ConcreteNode } from './graph/types.js';
import type { PipelineOrchestrator } from './pipeline/orchestrator.js';
import type { AgentChatHistory } from '../core/agentChatHistory.js';
import type { AdvancedTokenCalculator } from './utils/contextTokenCalculator.js';
import type { ContextManagementConfig } from './config/types.js';
import type { ContextEnvironment } from './pipeline/environment.js';
import type { ContextWorkingBufferImpl } from './pipeline/contextWorkingBuffer.js';

describe('ContextManager - Multi-stage and Incremental GC', () => {
  let mockEnv: ReturnType<typeof createMockEnvironment>;
  let mockOrchestrator: PipelineOrchestrator;
  let mockChatHistory: AgentChatHistory;
  let mockAdvancedTokenCalculator: AdvancedTokenCalculator;

  beforeEach(() => {
    mockEnv = createMockEnvironment();

    mockOrchestrator = {
      setNodeProvider: vi.fn(),
      waitForPipelines: vi.fn().mockResolvedValue(undefined),
      executeTriggerSync: vi
        .fn()
        .mockImplementation(async (trigger, buffer) => buffer),
      executeIngestionPipeline: vi
        .fn()
        .mockImplementation(async (nodes) => nodes),
      shutdown: vi.fn(),
    } as unknown as PipelineOrchestrator;

    mockChatHistory = {
      all: vi.fn().mockReturnValue([]),
      getHistory: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue([]),
      subscribe: vi.fn(),
    } as unknown as AgentChatHistory;

    mockAdvancedTokenCalculator = {
      getRawBaseUnits: vi.fn().mockReturnValue(0),
      getRawBaseUnitsForContent: vi.fn().mockReturnValue(0),
      calculateTokensAndBaseUnits: vi.fn(),
    } as unknown as AdvancedTokenCalculator;
  });

  const setupManager = (config: ContextManagementConfig) => {
    const sidecar: ContextProfile = {
      name: 'test',
      config,
      buildPipelines: () => [],
      buildAsyncPipelines: () => [],
    };
    return new ContextManager(
      sidecar,
      mockEnv as unknown as ContextEnvironment,
      mockEnv.tracer,
      mockOrchestrator,
      mockChatHistory,
      mockAdvancedTokenCalculator,
    );
  };

  it('should emit NormalizeNeeded when normalizedTokens budget is exceeded', async () => {
    const manager = setupManager({
      budget: {
        retainedTokens: 100,
        normalizedTokens: 150,
        maxTokens: 300,
      },
    } as unknown as ContextManagementConfig);

    const normalizeSpy = vi.fn();
    mockEnv.eventBus.onNormalizeNeeded(normalizeSpy);
    const consolidationSpy = vi.fn();
    mockEnv.eventBus.onConsolidationNeeded(consolidationSpy);

    // Mock token calculator for evaluateTriggers
    mockEnv.tokenCalculator.calculateConcreteListTokens = vi
      .fn()
      .mockImplementation((nodes: ConcreteNode[]) =>
        nodes.reduce(
          (sum: number, n: ConcreteNode) =>
            // Look for the mock tokens we attached to the dummy node
            sum + ((n as unknown as { _mockTokens: number })._mockTokens || 0),
          0,
        ),
      );

    const createNodeWithTokens = (
      id: string,
      type: NodeType,
      tokens: number,
    ) => {
      const node = createDummyNode(id, type);
      // @ts-expect-error - attaching mock tokens for test
      node._mockTokens = tokens;
      return node;
    };

    // Create 4 nodes, each 80 tokens. Total = 320 tokens.
    // Node 1 (oldest): prior=240. 240 > 150 -> Normalization (Archiving trigger)
    // Node 2: prior=160. 160 > 150 -> Normalization
    // Node 3: prior=80. 80 <= 100 -> Retained
    // Node 4 (newest): prior=0. 0 <= 100 -> Retained
    const nodes = [
      createNodeWithTokens('ep1', NodeType.USER_PROMPT, 80),
      createNodeWithTokens('ep2', NodeType.AGENT_THOUGHT, 80),
      createNodeWithTokens('ep3', NodeType.TOOL_EXECUTION, 80),
      createNodeWithTokens('ep4', NodeType.TOOL_EXECUTION, 80),
    ];

    // @ts-expect-error - access private method for testing
    manager.buffer = { nodes } as unknown as ContextWorkingBufferImpl;

    // Trigger evaluation manually with a dummy "new node" to bypass the empty check
    // @ts-expect-error - access private method for testing
    await manager.evaluateTriggers(nodes, new Set([nodes[3].id]), new Set());

    // Nodes 3 and 4 are retained.
    // Node 2 and Node 1 both fall out of normalizedTokens (160 > 150, 240 > 150).
    // Therefore they should trigger NormalizeNeeded. They should NOT trigger ConsolidationNeeded
    // because they exceeded normalized budget, so they skip the retained fallback.
    expect(consolidationSpy).not.toHaveBeenCalled();

    expect(normalizeSpy).toHaveBeenCalledOnce();
    const normalizeEvent = normalizeSpy.mock.calls[0][0];
    expect(normalizeEvent.targetNodeIds.has(nodes[0].id)).toBe(true);
    expect(normalizeEvent.targetNodeIds.has(nodes[1].id)).toBe(true);
    expect(normalizeEvent.targetNodeIds.has(nodes[2].id)).toBe(false);
  });
});
