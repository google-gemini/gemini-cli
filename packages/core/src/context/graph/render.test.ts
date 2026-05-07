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
});
