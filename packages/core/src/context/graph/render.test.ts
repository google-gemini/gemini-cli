/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from './render.js';
import type { ConcreteNode } from './types.js';
import { NodeType } from './types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextProfile } from '../config/profiles.js';
import type { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import type { Part } from '@google/genai';

describe('render', () => {
  it('should filter out previewNodeIds', async () => {
    const mockNodes: ConcreteNode[] = [
      {
        id: '1',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: '2',
        type: NodeType.AGENT_THOUGHT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'preview-1',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
    ];
    const previewNodeIds = new Set(['preview-1']);

    const orchestrator = {} as PipelineOrchestrator;
    const sidecar = { config: {} } as ContextProfile; // No budget
    const env = {
      graphMapper: {
        fromGraph: vi.fn((nodes: readonly ConcreteNode[]) =>
          nodes.map((n) => ({ text: n.id })),
        ),
      },
    } as unknown as ContextEnvironment;
    const tracer = {
      logEvent: vi.fn(),
    } as unknown as ContextTracer;

    const result = await render(
      mockNodes,
      orchestrator,
      sidecar,
      tracer,
      env,
      new Map(),
      0,
      previewNodeIds,
    );

    expect(result.history).toEqual([{ text: '1' }, { text: '2' }]);
  });

  it('simulates the boundary knapsack problem (loose boundary policy)', async () => {
    // 10k, 20k, 40k, 5k
    const mockNodes: ConcreteNode[] = [
      {
        id: 'D',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'C',
        type: NodeType.AGENT_THOUGHT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'B',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'A',
        type: NodeType.AGENT_THOUGHT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
    ];

    const tokenMap: Record<string, number> = {
      D: 5000,
      C: 40000,
      B: 20000,
      A: 10000,
    };

    const orchestrator = {
      executeTriggerSync: vi.fn(async (trigger, nodes, agedOutNodes) =>
        nodes.filter((n: ConcreteNode) => !agedOutNodes.has(n.id)),
      ),
    } as unknown as PipelineOrchestrator;

    const sidecar = {
      config: {
        budget: { maxTokens: 150000, retainedTokens: 65000 },
      },
    } as unknown as ContextProfile;

    const currentTokens = 160000;

    const env = {
      llmClient: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1000 }),
      },
      tokenCalculator: {
        calculateConcreteListTokens: vi.fn((nodes) => {
          if (nodes.length === 1) return tokenMap[nodes[0].id];
          return currentTokens;
        }),
        calculateTokenBreakdown: vi.fn(() => ({})),
      },
      graphMapper: {
        fromGraph: vi.fn((nodes: readonly ConcreteNode[]) =>
          nodes.map((n) => ({ text: n.id })),
        ),
      },
    } as unknown as ContextEnvironment;

    const tracer = {
      logEvent: vi.fn(),
    } as unknown as ContextTracer;

    const result = await render(
      mockNodes,
      orchestrator,
      sidecar,
      tracer,
      env,
      new Map(),
      0,
      new Set(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surviving = result.history.map((c: any) => c.text);
    // Loose Boundary: A (10k), B (20k), C (40k). Total = 70k.
    // Adding C pushes rolling total (70k) above retainedTokens (65k).
    // Under loose policy, C survives. D is strictly older and drops.
    expect(surviving).toEqual(['C', 'B', 'A']); // D is dropped
  });

  it('drops nodes that are STRICTLY older than the boundary node', async () => {
    const mockNodes: ConcreteNode[] = [
      {
        id: 'A',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'B',
        type: NodeType.AGENT_THOUGHT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
      {
        id: 'C',
        type: NodeType.USER_PROMPT,
        payload: {} as Part,
      } as unknown as ConcreteNode,
    ];

    const tokenMap: Record<string, number> = {
      C: 40000,
      B: 40000,
      A: 10000,
    };

    const orchestrator = {
      executeTriggerSync: vi.fn(async (trigger, nodes, agedOutNodes) =>
        nodes.filter((n: ConcreteNode) => !agedOutNodes.has(n.id)),
      ),
    } as unknown as PipelineOrchestrator;

    const sidecar = {
      config: {
        budget: { maxTokens: 150000, retainedTokens: 65000 },
      },
    } as unknown as ContextProfile;

    const currentTokens = 160000;

    const env = {
      llmClient: {
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 1000 }),
      },
      tokenCalculator: {
        calculateConcreteListTokens: vi.fn((nodes) => {
          if (nodes.length === 1) return tokenMap[nodes[0].id];
          return currentTokens;
        }),
        calculateTokenBreakdown: vi.fn(() => ({})),
      },
      graphMapper: {
        fromGraph: vi.fn((nodes: readonly ConcreteNode[]) =>
          nodes.map((n) => ({ text: n.id })),
        ),
      },
    } as unknown as ContextEnvironment;

    const tracer = {
      logEvent: vi.fn(),
    } as unknown as ContextTracer;

    const result = await render(
      mockNodes,
      orchestrator,
      sidecar,
      tracer,
      env,
      new Map(),
      0,
      new Set(),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surviving = result.history.map((c: any) => c.text);
    // C(40k), B(40k). Adding B pushes total to 80k. B is the boundary node and survives. A drops.
    expect(surviving).toEqual(['B', 'C']); // A is dropped
  });
});
