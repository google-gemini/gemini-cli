/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../ir/types.js';
import type {
  ContextProcessor,
  ContextWorker,
  ContextAccountingState,
} from '../pipeline.js';
import type { SidecarConfig, PipelineDef, PipelineTrigger } from './types.js';
import type {
  ContextEnvironment,
  ContextEventBus,
  ContextTracer,
} from './environment.js';
import type { ProcessorRegistry } from './registry.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { InboxSnapshotImpl } from './inbox.js';

export class PipelineOrchestrator {
  private activeTimers: NodeJS.Timeout[] = [];
  private readonly instantiatedProcessors = new Map<string, ContextProcessor>();
  private readonly instantiatedWorkers = new Map<string, ContextWorker>();

  constructor(
    private readonly config: SidecarConfig,
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
    private readonly registry: ProcessorRegistry,
  ) {
    this.instantiateProcessors();
    this.instantiateWorkers();
    this.setupTriggers();
  }

  private isNodeAllowed(
    node: import('../ir/types.js').ConcreteNode,
    triggerTargets: ReadonlySet<string>,
    state: ContextAccountingState,
  ): boolean {
    return (
      triggerTargets.has(node.id) &&
      !state.protectedLogicalIds.has(node.id) &&
      (!node.logicalParentId ||
        !state.protectedLogicalIds.has(node.logicalParentId))
    );
  }

  private instantiateProcessors() {
    for (const pipeline of this.config.pipelines) {
      for (const procDef of pipeline.processors) {
        if (!this.instantiatedProcessors.has(procDef.processorId)) {
          const factory = this.registry.get(procDef.processorId);
          const instance = factory.create(
            this.env,
            procDef.options || {},
          ) as ContextProcessor;
          this.instantiatedProcessors.set(procDef.processorId, instance);
        }
      }
    }
  }

  private instantiateWorkers() {
    if (!this.config.workers) return;
    for (const workerDef of this.config.workers) {
      if (!this.instantiatedWorkers.has(workerDef.workerId)) {
        const factory = this.registry.get(workerDef.workerId);
        const instance = factory.create(
          this.env,
          workerDef.options || {},
        ) as unknown as ContextWorker;
        this.instantiatedWorkers.set(workerDef.workerId, instance);
      }
    }
  }

  private setupTriggers() {
    // 1. Pipeline Triggers
    for (const pipeline of this.config.pipelines) {
      for (const trigger of pipeline.triggers) {
        if (typeof trigger === 'object' && trigger.type === 'timer') {
          const timer = setInterval(() => {
            // Background timers not fully implemented in V1 yet
          }, trigger.intervalMs);
          this.activeTimers.push(timer);
        } else if (trigger === 'retained_exceeded') {
          this.eventBus.onConsolidationNeeded((event) => {
            const state: ContextAccountingState = {
              currentTokens: 0,
              retainedTokens: this.config.budget.retainedTokens,
              maxTokens: this.config.budget.maxTokens,
              isBudgetSatisfied: false,
              deficitTokens: event.targetDeficit,
              protectedLogicalIds: new Set(),
            };
            void this.executePipelineAsync(
              pipeline,
              [],
              event.targetNodeIds,
              state,
            );
          });
        } else if (trigger === 'new_message') {
          this.eventBus.onChunkReceived((event) => {
            const state: ContextAccountingState = {
              currentTokens: 0,
              retainedTokens: this.config.budget.retainedTokens,
              maxTokens: this.config.budget.maxTokens,
              isBudgetSatisfied: false,
              deficitTokens: 0,
              protectedLogicalIds: new Set(),
            };
            void this.executePipelineAsync(
              pipeline,
              [],
              event.targetNodeIds,
              state,
            );
          });
        }
      }
    }

    // 2. Worker Triggers (onNodesAdded is roughly onChunkReceived for now)
    this.eventBus.onChunkReceived((event) => {
      // Fire all workers that care about new nodes
      for (const worker of this.instantiatedWorkers.values()) {
        if (worker.triggers.onNodesAdded) {
          const inboxSnapshot = new InboxSnapshotImpl(
            this.env.inbox?.getMessages() || [],
          );
          // Fire and forget
          worker.execute({ targets: [], inbox: inboxSnapshot }).catch((e) => {
            debugLogger.error(`Worker ${worker.name} failed onNodesAdded:`, e);
          });
        }
      }
    });

    // We don't have a formal event bus for inbox publish yet, but we will soon.
    // For now the workers are just registered.
  }

  shutdown() {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
  }

  applyProcessorDiff(
    ship: ReadonlyArray<ConcreteNode>,
    targets: ReadonlyArray<ConcreteNode>,
    returnedNodes: ReadonlyArray<ConcreteNode>,
  ): ReadonlyArray<ConcreteNode> {
    const mutableShip = [...ship];
    const targetSet = new Set(targets.map((n) => n.id));
    const returnedMap = new Map(returnedNodes.map((n) => [n.id, n]));

    const removedIds = new Set<string>();
    const newNodes: ConcreteNode[] = [];

    for (const t of targets) {
      const returnedNode = returnedMap.get(t.id);
      if (!returnedNode) {
        removedIds.add(t.id);
      } else if (returnedNode !== t) {
        removedIds.add(t.id);
        newNodes.push(returnedNode);
      }
    }

    for (const r of returnedNodes) {
      if (!targetSet.has(r.id)) {
        newNodes.push(r);
      }
    }

    if (removedIds.size === 0 && newNodes.length === 0) {
      return ship;
    }

    let earliestRemovalIdx = mutableShip.length;
    let i = 0;
    while (i < mutableShip.length) {
      if (removedIds.has(mutableShip[i].id)) {
        if (i < earliestRemovalIdx) earliestRemovalIdx = i;
        mutableShip.splice(i, 1);
      } else {
        i++;
      }
    }

    if (newNodes.length > 0) {
      mutableShip.splice(earliestRemovalIdx, 0, ...newNodes);
    }

    return mutableShip;
  }

  async executeTriggerSync(
    trigger: PipelineTrigger,
    ship: ReadonlyArray<ConcreteNode>,
    triggerTargets: ReadonlySet<string>,
    state: ContextAccountingState,
  ): Promise<ReadonlyArray<ConcreteNode>> {
    let currentShip = ship;
    const pipelines = this.config.pipelines.filter((p) =>
      p.triggers.includes(trigger),
    );

    // Freeze the inbox for this pipeline run
    const inboxSnapshot = new InboxSnapshotImpl(
      this.env.inbox?.getMessages() || [],
    );

    for (const pipeline of pipelines) {
      for (const procDef of pipeline.processors) {
        const processor = this.instantiatedProcessors.get(procDef.processorId);
        if (!processor) continue;

        try {
          this.tracer.logEvent(
            'Orchestrator',
            `Executing processor synchronously: ${procDef.processorId}`,
          );

          const allowedTargets = currentShip.filter((n) =>
            this.isNodeAllowed(n, triggerTargets, state),
          );

          const returnedNodes = await processor.process({
            buffer: {} as any, // TODO: Implement ContextWorkingBuffer fully
            targets: allowedTargets,
            state,
            inbox: inboxSnapshot,
          });

          currentShip = this.applyProcessorDiff(
            currentShip,
            allowedTargets,
            returnedNodes,
          );
        } catch (error) {
          debugLogger.error(
            `Synchronous processor ${procDef.processorId} failed:`,
            error,
          );
        }
      }
    }

    // Success! Drain consumed messages
    this.env.inbox?.drainConsumed(inboxSnapshot.getConsumedIds());

    return currentShip;
  }

  private async executePipelineAsync(
    pipeline: PipelineDef,
    ship: ReadonlyArray<ConcreteNode>,
    triggerTargets: Set<string>,
    state: ContextAccountingState,
  ) {
    this.tracer.logEvent(
      'Orchestrator',
      `Triggering async pipeline: ${pipeline.name}`,
    );
    if (!ship || ship.length === 0) return;

    let currentShip = ship;
    const inboxSnapshot = new InboxSnapshotImpl(
      this.env.inbox?.getMessages() || [],
    );

    for (const procDef of pipeline.processors) {
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        this.tracer.logEvent(
          'Orchestrator',
          `Executing processor: ${procDef.processorId} (async)`,
        );

        const allowedTargets = currentShip.filter((n) =>
          this.isNodeAllowed(n, triggerTargets, state),
        );

        const returnedNodes = await processor.process({
          buffer: {} as any,
          targets: allowedTargets,
          state,
          inbox: inboxSnapshot,
        });

        currentShip = this.applyProcessorDiff(
          currentShip,
          allowedTargets,
          returnedNodes,
        );
      } catch (error) {
        debugLogger.error(
          `Pipeline ${pipeline.name} failed async at ${procDef.processorId}:`,
          error,
        );
        return;
      }
    }

    this.env.inbox?.drainConsumed(inboxSnapshot.getConsumedIds());
  }
}
