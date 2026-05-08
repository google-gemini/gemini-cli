/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PipelineOrchestrator } from './orchestrator.js';
import {
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import { NodeType } from '../graph/types.js';
import type { ContextEnvironment } from './environment.js';
import type {
  ContextProcessor,
  AsyncContextProcessor,
  ProcessArgs,
} from '../pipeline.js';
import type { PipelineDef, AsyncPipelineDef } from '../config/types.js';
import type { ContextEventBus } from '../eventBus.js';
import type { ConcreteNode, UserPrompt } from '../graph/types.js';

// A realistic mock processor that modifies the text of the first target node
function createModifyingProcessor(id: string): ContextProcessor {
  return {
    id,
    name: 'ModifyingProcessor',
    process: async (args: ProcessArgs) => {
      const newTargets = [...args.targets];
      if (
        newTargets.length > 0 &&
        newTargets[0].type === NodeType.USER_PROMPT
      ) {
        const prompt = newTargets[0];
        if (prompt.payload.text) {
          newTargets[0] = {
            ...prompt,
            id: prompt.id + '-modified',
            replacesId: prompt.id,
            payload: {
              ...prompt.payload,
              text: prompt.payload.text + ' [modified]',
            },
          };
        }
      }
      return newTargets;
    },
  };
}

// A processor that just throws an error
function createThrowingProcessor(id: string): ContextProcessor {
  return {
    id,
    name: 'Throwing',
    process: async (): Promise<readonly ConcreteNode[]> => {
      throw new Error('Processor failed intentionally');
    },
  };
}

// A mock async processor that signals it ran
function createMockAsyncProcessor(
  id: string,
  executeSpy: ReturnType<typeof vi.fn>,
): AsyncContextProcessor {
  return {
    id,
    name: 'MockAsyncProcessor',
    process: async (args: ProcessArgs) => {
      executeSpy(args);
    },
  };
}

describe('PipelineOrchestrator (Component)', () => {
  let env: ContextEnvironment;
  let eventBus: ContextEventBus;

  beforeEach(() => {
    env = createMockEnvironment();
    eventBus = env.eventBus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupOrchestrator = (
    pipelines: PipelineDef[],
    asyncPipelines: AsyncPipelineDef[] = [],
  ) => {
    const orchestrator = new PipelineOrchestrator(
      pipelines,
      asyncPipelines,
      env,
      eventBus,
      env.tracer,
    );
    return orchestrator;
  };

  describe('Synchronous Pipeline Execution', () => {
    it('applies processors in sequence on matching trigger', async () => {
      const pipelines: PipelineDef[] = [
        {
          name: 'TestPipeline',
          triggers: ['new_message'],
          processors: [createModifyingProcessor('Mod')],
        },
      ];

      const orchestrator = setupOrchestrator(pipelines);
      const originalNode = createDummyNode('ep1', NodeType.USER_PROMPT, 50, {
        payload: { text: 'Original' },
      });

      const processed = await orchestrator.executeTriggerSync(
        'new_message',
        [originalNode],
        new Set([originalNode.id]),
        new Set(),
      );

      expect(processed.length).toBe(1);
      const resultingNode = processed[0] as UserPrompt;
      expect(resultingNode.payload.text).toBe('Original [modified]');
      expect(resultingNode.replacesId).toBe(originalNode.id);
    });

    it('bypasses pipelines that do not match the trigger', async () => {
      const pipelines: PipelineDef[] = [
        {
          name: 'TestPipeline',
          triggers: ['gc_backstop'], // Different trigger
          processors: [createModifyingProcessor('Mod')],
        },
      ];

      const orchestrator = setupOrchestrator(pipelines);
      const originalNode = createDummyNode('ep1', NodeType.USER_PROMPT, 50, {
        payload: { text: 'Original' },
      });

      const processed = await orchestrator.executeTriggerSync(
        'new_message',
        [originalNode],
        new Set([originalNode.id]),
        new Set(),
      );

      expect(processed).toEqual([originalNode]); // Untouched
    });

    it('gracefully handles a failing processor without crashing the pipeline', async () => {
      const pipelines: PipelineDef[] = [
        {
          name: 'FailingPipeline',
          triggers: ['new_message'],
          processors: [
            createThrowingProcessor('Thrower'),
            createModifyingProcessor('Mod'),
          ],
        },
      ];

      const orchestrator = setupOrchestrator(pipelines);
      const originalNode = createDummyNode('ep1', NodeType.USER_PROMPT, 50, {
        payload: { text: 'Original' },
      });

      // The throwing processor should be caught and logged, allowing Mod to still run.
      const processed = await orchestrator.executeTriggerSync(
        'new_message',
        [originalNode],
        new Set([originalNode.id]),
        new Set(),
      );

      expect(processed.length).toBe(1);
      const resultingNode = processed[0] as UserPrompt;
      expect(resultingNode.payload.text).toBe('Original [modified]');
    });
  });

  describe('Asynchronous async pipeline Events', () => {
    it('routes emitChunkReceived to async pipelines with nodes_added trigger', async () => {
      const executeSpy = vi.fn();
      const asyncProcessor = createMockAsyncProcessor(
        'MyAsyncProcessor',
        executeSpy,
      );

      setupOrchestrator(
        [],
        [
          {
            name: 'TestAsync',
            triggers: ['nodes_added'],
            processors: [asyncProcessor],
          },
        ],
      );

      const node1 = createDummyNode('ep1', NodeType.USER_PROMPT, 10);
      const node2 = createDummyNode('ep1', NodeType.AGENT_THOUGHT, 20);

      eventBus.emitChunkReceived({
        nodes: [node1, node2],
        targetNodeIds: new Set([node2.id]),
      });

      // Yield event loop
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const callArgs = executeSpy.mock.calls[0][0];
      expect(callArgs.targets).toEqual([node2]); // AsyncProcessors only get the target nodes
    });
  });
});
