/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PipelineOrchestrator } from './orchestrator.js';
import { SidecarRegistry } from './registry.js';
import {
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { ContextEnvironment } from './environment.js';
import type {
  ContextProcessor,
  ContextWorker,
  InboxSnapshot,
  ProcessArgs,
} from '../pipeline.js';
import type { PipelineDef, ProcessorConfig, SidecarConfig } from './types.js';
import type { ContextEventBus } from '../eventBus.js';
import type { ConcreteNode, UserPrompt } from '../ir/types.js';

// A realistic mock processor that modifies the text of the first target node
class ModifyingProcessor implements ContextProcessor {
  static create() {
    return new ModifyingProcessor();
  }
  constructor() {}
  readonly name = 'ModifyingProcessor';
  readonly id = 'ModifyingProcessor';
  readonly options = {};
  async process(args: ProcessArgs) {
    const newTargets = [...args.targets];
    if (newTargets.length > 0 && newTargets[0].type === 'USER_PROMPT') {
      const prompt = newTargets[0];
      const newParts = [...prompt.semanticParts];
      if (newParts.length > 0 && newParts[0].type === 'text') {
        newParts[0] = {
          ...newParts[0],
          text: newParts[0].text + ' [modified]',
        };
      }
      newTargets[0] = { ...prompt, id: prompt.id + '-modified', replacesId: prompt.id, semanticParts: newParts };
    }
    return newTargets;
  }
}

// A processor that just throws an error
class ThrowingProcessor implements ContextProcessor {
  static create() {
    return new ThrowingProcessor();
  }
  constructor() {}
  readonly name = 'Throwing';
  readonly id = 'Throwing';
  readonly options = {};
  async process(): Promise<readonly ConcreteNode[]> {
    throw new Error('Processor failed intentionally');
  }
}

// A mock worker that signals it ran
class MockWorker implements ContextWorker {
  static create() {
    return new MockWorker();
  }
  constructor() {}
  readonly name = 'MockWorker';
  readonly id = 'MockWorker';
  readonly triggers = {
    onNodesAdded: true,
  };
  wasExecuted = false;

  async execute(args: {
    targets: readonly ConcreteNode[];
    inbox: InboxSnapshot;
  }) {
    this.wasExecuted = true;
    if (args.targets.length > 0 && args.targets[0].type === 'USER_PROMPT') {
      const prompt = args.targets[0];
      if (prompt.semanticParts[0].type === 'text') {
        args.inbox.consume('test');
      }
    }
  }
}

describe('PipelineOrchestrator (Component)', () => {
  let env: ContextEnvironment;
  let eventBus: ContextEventBus;
  let registry: SidecarRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    env = createMockEnvironment();
    eventBus = env.eventBus;
    registry = new SidecarRegistry();

    registry.registerProcessor({
      id: 'ModifyingProcessor',
      schema: {},
      create: () => new ModifyingProcessor(),
    });
    registry.registerProcessor({
      id: 'ThrowingProcessor',
      schema: {},
      create: () => new ThrowingProcessor(),
    });
    registry.registerWorker({
      id: 'MockWorker',
      schema: {},
      create: () => new MockWorker(),
    });
  });

  afterEach(() => {
    registry.clear();
  });

  const createConfig = (
    pipelines: PipelineDef[],
    workers?: Array<{ workerId: string }>,
  ): SidecarConfig => ({
    budget: { maxTokens: 100, retainedTokens: 50 },
    pipelines,
    workers,
  });

  it('instantiates processors and workers from the registry on initialization', () => {
    const config = createConfig(
      [
        {
          name: 'SyncPipe',
          triggers: ['new_message'],
          processors: [
            { processorId: 'ModifyingProcessor' } as unknown as ProcessorConfig,
          ],
        },
      ],
      [{ workerId: 'MockWorker' }],
    );

    const orchestrator = new PipelineOrchestrator(
      config,
      env,
      eventBus,
      env.tracer,
      registry,
    );

    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orchestrator as any).instantiatedProcessors.has('ModifyingProcessor'),
    ).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((orchestrator as any).instantiatedWorkers.has('MockWorker')).toBe(
      true,
    );
  });

  it('throws an error if a config requests an unknown processor', () => {
    const config = createConfig([
      {
        name: 'ThrowPipe',
        triggers: ['new_message'],
        processors: [
          { processorId: 'DoesNotExist' } as unknown as ProcessorConfig,
        ],
      },
    ]);

    expect(
      () =>
        new PipelineOrchestrator(config, env, eventBus, env.tracer, registry),
    ).toThrow('Context Processor [DoesNotExist] is not registered.');
  });

  it('executes synchronous routes (executeTriggerSync) and returns modified array', async () => {
    const config = createConfig([
      {
        name: 'SyncPipe',
        triggers: ['new_message'],
        processors: [
          { processorId: 'ModifyingProcessor' } as unknown as ProcessorConfig,
        ],
      },
    ]);
    const orchestrator = new PipelineOrchestrator(
      config,
      env,
      eventBus,
      env.tracer,
      registry,
    );

    const nodes = [
      createDummyNode(
        'not-protected-ep',
        'USER_PROMPT',
        100,
        {
          semanticParts: [{ type: 'text', text: 'original text' }],
        },
        'not-protected-id',
      ),
    ];

    const result = await orchestrator.executeTriggerSync(
      'new_message',
      nodes,
      new Set(nodes.map((s) => s.id)),
      new Set(),
    );

    expect(result).toHaveLength(1);
    const modifiedPrompt = result[0] as UserPrompt;
    assert(
      modifiedPrompt.semanticParts[0].type === 'text',
      'Expected a text part',
    );
    expect(modifiedPrompt.semanticParts[0].text).toBe(
      'original text [modified]',
    );
  });

  it('gracefully handles and swallows processor errors in synchronous routes', async () => {
    const config = createConfig([
      {
        name: 'ThrowPipe',
        triggers: ['new_message'],
        processors: [
          { processorId: 'ThrowingProcessor' } as unknown as ProcessorConfig,
        ],
      },
    ]);
    const orchestrator = new PipelineOrchestrator(
      config,
      env,
      eventBus,
      env.tracer,
      registry,
    );

    const nodes = [
      createDummyNode(
        'not-protected-ep',
        'USER_PROMPT',
        100,
        undefined,
        'not-protected-id',
      ),
    ];

    // It should not throw! It should swallow the error and return the unmodified array.
    const result = await orchestrator.executeTriggerSync(
      'new_message',
      nodes,
      new Set(nodes.map((s) => s.id)),
      new Set(),
    );

    expect(result).toHaveLength(1);
    expect(result).toStrictEqual(nodes);
  });

  it('automatically dispatches workers when matching EventBus events occur', async () => {
    const config = createConfig([], [{ workerId: 'MockWorker' }]);

    const orchestrator = new PipelineOrchestrator(
      config,
      env,
      eventBus,
      env.tracer,
      registry,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerInstance = (orchestrator as any).instantiatedWorkers.get(
      'MockWorker',
    ) as MockWorker;
    expect(workerInstance.wasExecuted).toBe(false);

    const nodes = [
      createDummyNode(
        'not-protected-ep',
        'USER_PROMPT',
        100,
        {
          semanticParts: [{ type: 'text', text: 'worker trigger text' }],
        },
        'not-protected-id',
      ),
    ];

    // Emit the new_message chunk which maps to onNodesAdded for workers
    eventBus.emitChunkReceived({
      nodes,
      targetNodeIds: new Set(nodes.map((n) => n.id)),
    });

    // Worker execute is fire and forget, so we yield to the event loop
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(workerInstance.wasExecuted).toBe(true);
  });
});
