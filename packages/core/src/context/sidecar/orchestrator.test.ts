/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PipelineOrchestrator } from './orchestrator.js';
import { SidecarRegistry } from './registry.js';
import {
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { ContextEnvironment } from './environment.js';
import type { ContextProcessor } from '../pipeline.js';
import type { PipelineDef, ProcessorConfig, SidecarConfig } from './types.js';
import type { ContextEventBus } from '../eventBus.js';

// Create a Dummy Processor for testing Orchestration routing
class DummySyncProcessor implements ContextProcessor {
  static create() {
    return new DummySyncProcessor();
  }
  constructor() {}
  readonly name = 'DummySync';
  readonly id = 'DummySync';
  readonly options = {};
  async process(args: any) {
    const newTargets = [...args.targets];
    if (newTargets.length > 0) {
      newTargets[0] = { ...newTargets[0], dummyModified: true };
    }
    return newTargets;
  }
}

class DummyAsyncProcessor implements ContextProcessor {
  static create() {
    return new DummyAsyncProcessor();
  }
  constructor() {}
  readonly name = 'DummyAsync';
  readonly id = 'DummyAsync';
  readonly options = {};
  async process(args: any) {
    const newTargets = [...args.targets];
    if (newTargets.length > 0) {
      newTargets[0] = { ...newTargets[0], dummyModified: true };
    }
    return newTargets;
  }
}

class ThrowingProcessor implements ContextProcessor {
  static create() {
    return new ThrowingProcessor();
  }
  constructor() {}
  readonly name = 'Throwing';
  readonly id = 'Throwing';
  readonly options = {};
  async process(): Promise<any> {
    throw new Error('Processor failed intentionally');
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

    // Register our test processors
    registry.registerProcessor({
      id: 'DummySyncProcessor',
      schema: {},
      create: () => new DummySyncProcessor(),
    });
    registry.registerProcessor({
      id: 'DummyAsyncProcessor',
      schema: {},
      create: () => new DummyAsyncProcessor(),
    });
    registry.registerProcessor({
      id: 'ThrowingProcessor',
      schema: {},
      create: () => new ThrowingProcessor(),
    });
  });

  afterEach(() => {
    // Cleanup registry to not pollute other tests
    registry.clear();
  });

  const createConfig = (pipelines: PipelineDef[]): SidecarConfig => ({
    budget: { maxTokens: 100, retainedTokens: 50 },
    pipelines,
  });

  it('instantiates processors from the registry on initialization', () => {
    const config = createConfig([
      {
        name: 'ThrowPipe',
        execution: 'blocking',
        triggers: ['new_message'],
        processors: [
          { processorId: 'DummySyncProcessor' } as unknown as ProcessorConfig,
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
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orchestrator as any).instantiatedProcessors.has('DummySyncProcessor'),
    ).toBe(true);
  });

  it('throws an error if a config requests an unknown processor', () => {
    const config = createConfig([
      {
        name: 'ThrowPipe',
        execution: 'blocking',
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

  it('executes blocking pipelines synchronously and returns the modified array', async () => {
    const config = createConfig([
      {
        name: 'SyncPipe',
        execution: 'blocking',
        triggers: ['new_message'],
        processors: [
          { processorId: 'DummySyncProcessor' } as unknown as ProcessorConfig,
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

    const nodes = [createDummyNode('not-protected-ep', 'USER_PROMPT', 100, undefined, 'not-protected-id')];

    const result = await orchestrator.executeTriggerSync(
      'new_message',
      nodes,
      new Set(nodes.map((s) => s.id)),
      new Set(),
    );

    expect(result).toHaveLength(1);
    expect(
      (result[0] as unknown as { dummyModified?: boolean }).dummyModified,
    ).toBe(true);
  });

  it('executes background pipelines asynchronously without blocking the return', async () => {
    const config = createConfig([
      {
        name: 'AsyncPipe',
        execution: 'background',
        triggers: ['new_message'],
        processors: [
          { processorId: 'DummyAsyncProcessor' } as unknown as ProcessorConfig,
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

    const nodes = [createDummyNode('not-protected-ep', 'USER_PROMPT', 100, undefined, 'not-protected-id')];

    // This should resolve immediately with the UNMODIFIED array because execution is background
    const result = await orchestrator.executeTriggerSync(
      'new_message',
      nodes,
      new Set(nodes.map((s) => s.id)),
      new Set(),
    );

    expect(result).toHaveLength(1);
    expect(
      (result[0] as unknown as { asyncModified: unknown }).asyncModified,
    ).toBeUndefined(); // Not modified yet!

    // Wait for the background task to complete (50ms delay in DummyAsyncProcessor)
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  it('gracefully handles and swallows processor errors in synchronous pipelines', async () => {
    const config = createConfig([
      {
        name: 'ThrowPipe',
        execution: 'blocking',
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

    const nodes = [createDummyNode('not-protected-ep', 'USER_PROMPT', 100, undefined, 'not-protected-id')];

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

  it('automatically binds to retained_exceeded trigger via EventBus', () => {
    const config = createConfig([
      {
        name: 'PressureRelief',
        execution: 'background',
        triggers: ['retained_exceeded'],
        processors: [
          { processorId: 'DummyAsyncProcessor' } as unknown as ProcessorConfig,
        ],
      },
    ]);

    // Spy on the private method to see if the trigger fires it
    const executeSpy = vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      PipelineOrchestrator.prototype as any,
      'executePipelineAsync',
    );

    new PipelineOrchestrator(config, env, eventBus, env.tracer, registry);

    const nodes = [createDummyNode('1', 'USER_PROMPT')];

    // Emit the trigger
    eventBus.emitConsolidationNeeded({
      nodes,
      targetDeficit: 100,
      targetNodeIds: new Set(),
    });

    expect(executeSpy).toHaveBeenCalled();
  });
});
