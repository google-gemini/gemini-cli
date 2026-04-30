/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../graph/types.js';
import type {
  AsyncPipelineDef,
  PipelineDef,
  PipelineTrigger,
} from '../config/types.js';
import type {
  ContextEnvironment,
  ContextEventBus,
  ContextTracer,
} from './environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { InboxSnapshotImpl } from './inbox.js';
import { ContextWorkingBufferImpl } from './contextWorkingBuffer.js';

export class PipelineOrchestrator {
  private activeTimers: NodeJS.Timeout[] = [];
  private readonly pendingPipelines = new Map<string, Promise<void>>();
  private readonly pipelineMutex = new Map<string, Promise<void>>();
  private nodeProvider: (() => readonly ConcreteNode[]) | undefined;

  constructor(
    private readonly pipelines: PipelineDef[],
    private readonly asyncPipelines: AsyncPipelineDef[],
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
  ) {
    this.setupTriggers();
  }

  /**
   * Sets the provider for the latest live nodes.
   * This is used by sequential pipeline runs to ensure they operate on current state.
   */
  setNodeProvider(provider: () => readonly ConcreteNode[]) {
    this.nodeProvider = provider;
  }

  /**
   * Returns a promise that resolves when all currently executing async pipelines have finished.
   * This acts as a 'Pressure Barrier' for the ContextManager.
   */
  async waitForPipelines(): Promise<void> {
    const pending = Array.from(this.pendingPipelines.values());
    if (pending.length > 0) {
      debugLogger.log(
        `[PipelineOrchestrator] Waiting for ${pending.length} pending async pipelines to complete...`,
      );
      await Promise.allSettled(pending);
    }
  }

  private isNodeAllowed(
    node: ConcreteNode,
    triggerTargets: ReadonlySet<string>,
    protectedTurnIds: ReadonlySet<string> = new Set(),
  ): boolean {
    return (
      triggerTargets.has(node.id) &&
      !protectedTurnIds.has(node.id) &&
      !protectedTurnIds.has(node.turnId)
    );
  }

  private setupTriggers() {
    const bindTriggers = <P extends PipelineDef | AsyncPipelineDef>(
      pipelines: P[],
      executeFn: (
        pipeline: P,
        nodes: readonly ConcreteNode[],
        targets: ReadonlySet<string>,
        protectedIds: ReadonlySet<string>,
      ) => void,
    ) => {
      for (const pipeline of pipelines) {
        for (const trigger of pipeline.triggers) {
          if (typeof trigger === 'object' && trigger.type === 'timer') {
            const timer = setInterval(() => {
              // Background timers not fully implemented in V1 yet
            }, trigger.intervalMs);
            this.activeTimers.push(timer);
          } else if (
            trigger === 'retained_exceeded' ||
            trigger === 'nodes_aged_out'
          ) {
            this.eventBus.onConsolidationNeeded((event) => {
              executeFn(pipeline, event.nodes, event.targetNodeIds, new Set());
            });
          } else if (trigger === 'new_message' || trigger === 'nodes_added') {
            this.eventBus.onChunkReceived((event) => {
              executeFn(pipeline, event.nodes, event.targetNodeIds, new Set());
            });
          }
        }
      }
    };

    bindTriggers(this.pipelines, (pipeline, nodes, targets, protectedIds) => {
      // Fetch the tail of the current chain for this pipeline, or start a new one
      const existing =
        this.pipelineMutex.get(pipeline.name) || Promise.resolve();

      const nextPromise = (async () => {
        try {
          // Wait for the previous run of THIS pipeline to complete
          await existing;

          // We re-fetch the LATEST nodes from the environment's live buffer
          // to ensure this sequential run isn't operating on stale data from the trigger event.
          const latestNodes = this.nodeProvider!();

          await this.executePipelineAsync(
            pipeline,
            latestNodes,
            new Set(targets),
            new Set(protectedIds),
          );
        } catch (e) {
          debugLogger.error(`Pipeline chain ${pipeline.name} failed:`, e);
        }
      })();

      // Update the chain tail
      this.pipelineMutex.set(pipeline.name, nextPromise);

      const pipelineId = `${pipeline.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.pendingPipelines.set(pipelineId, nextPromise);
      void nextPromise.finally(() => {
        this.pendingPipelines.delete(pipelineId);
        // Only clear the mutex if we are still the tail of the chain
        if (this.pipelineMutex.get(pipeline.name) === nextPromise) {
          this.pipelineMutex.delete(pipeline.name);
        }
      });
    });

    bindTriggers(this.asyncPipelines, (pipeline, nodes, targetIds) => {
      const inboxSnapshot = new InboxSnapshotImpl(
        this.env.inbox.getMessages() || [],
      );
      const targets = nodes.filter((n) => targetIds.has(n.id));
      for (const processor of pipeline.processors) {
        processor
          .process({
            targets,
            inbox: inboxSnapshot,
            buffer: ContextWorkingBufferImpl.initialize(nodes),
          })
          .catch((e: unknown) =>
            debugLogger.error(`AsyncProcessor ${processor.name} failed:`, e),
          );
      }
    });
  }

  shutdown() {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
  }

  async executeTriggerSync(
    trigger: PipelineTrigger,
    nodes: readonly ConcreteNode[],
    triggerTargets: ReadonlySet<string>,
    protectedTurnIds: ReadonlySet<string> = new Set(),
  ): Promise<readonly ConcreteNode[]> {
    this.tracer.logEvent('Orchestrator', 'Strategy Intent', {
      trigger,
      totalNodes: nodes.length,
      targetNodes: triggerTargets.size,
    });
    let currentBuffer = ContextWorkingBufferImpl.initialize(nodes);
    const triggerPipelines = this.pipelines.filter((p) =>
      p.triggers.includes(trigger),
    );

    // Freeze the inbox for this pipeline run
    const inboxSnapshot = new InboxSnapshotImpl(
      this.env.inbox.getMessages() || [],
    );

    for (const pipeline of triggerPipelines) {
      for (const processor of pipeline.processors) {
        try {
          this.tracer.logEvent(
            'Orchestrator',
            `Executing processor synchronously: ${processor.id}`,
            { nodeCountBefore: currentBuffer.nodes.length },
          );

          const allowedTargets = currentBuffer.nodes.filter((n) =>
            this.isNodeAllowed(n, triggerTargets, protectedTurnIds),
          );

          const returnedNodes = await processor.process({
            buffer: currentBuffer,
            targets: allowedTargets,
            inbox: inboxSnapshot,
          });

          currentBuffer = currentBuffer.applyProcessorResult(
            processor.id,
            allowedTargets,
            returnedNodes,
          );

          const addedNodes = returnedNodes.filter(
            (n) => !allowedTargets.some((at) => at.id === n.id),
          );
          const removedNodes = allowedTargets.filter(
            (at) => !returnedNodes.some((n) => n.id === at.id),
          );

          this.tracer.logEvent('Orchestrator', 'Transformation Lineage', {
            processorId: processor.id,
            inputNodeCount: allowedTargets.length,
            outputNodeCount: returnedNodes.length,
            removedNodeIds: removedNodes.map((n) => n.id),
            addedNodes: addedNodes.map((n) => ({
              id: n.id,
              replacesId: n.replacesId,
              abstractsIds: n.abstractsIds,
              approxTokens:
                this.env.tokenCalculator.calculateConcreteListTokens([n]),
            })),
          });
        } catch (error) {
          debugLogger.error(
            `Synchronous processor ${processor.id} failed:`,
            error,
          );
        }
      }
    }

    // Success! Drain consumed messages
    this.env.inbox.drainConsumed(inboxSnapshot.getConsumedIds());

    return currentBuffer.nodes;
  }

  private async executePipelineAsync(
    pipeline: PipelineDef,
    nodes: readonly ConcreteNode[],
    triggerTargets: Set<string>,
    protectedTurnIds: ReadonlySet<string> = new Set(),
  ) {
    this.tracer.logEvent(
      'Orchestrator',
      `Triggering async pipeline: ${pipeline.name}`,
      {
        triggerTargets: triggerTargets.size,
        totalNodes: nodes.length,
      },
    );
    if (!nodes || nodes.length === 0) return;

    let currentBuffer = ContextWorkingBufferImpl.initialize(nodes);
    const inboxSnapshot = new InboxSnapshotImpl(
      this.env.inbox.getMessages() || [],
    );

    for (const processor of pipeline.processors) {
      try {
        this.tracer.logEvent(
          'Orchestrator',
          `Executing processor: ${processor.id} (async)`,
          { nodeCountBefore: currentBuffer.nodes.length },
        );

        const allowedTargets = currentBuffer.nodes.filter((n) =>
          this.isNodeAllowed(n, triggerTargets, protectedTurnIds),
        );

        const returnedNodes = await processor.process({
          buffer: currentBuffer,
          targets: allowedTargets,
          inbox: inboxSnapshot,
        });

        currentBuffer = currentBuffer.applyProcessorResult(
          processor.id,
          allowedTargets,
          returnedNodes,
        );

        const addedNodes = returnedNodes.filter(
          (n) => !allowedTargets.some((at) => at.id === n.id),
        );
        const removedNodes = allowedTargets.filter(
          (at) => !returnedNodes.some((n) => n.id === at.id),
        );

        this.tracer.logEvent('Orchestrator', 'Transformation Lineage (Async)', {
          processorId: processor.id,
          inputNodeCount: allowedTargets.length,
          outputNodeCount: returnedNodes.length,
          removedNodeIds: removedNodes.map((n) => n.id),
          addedNodes: addedNodes.map((n) => ({
            id: n.id,
            replacesId: n.replacesId,
            abstractsIds: n.abstractsIds,
            approxTokens: this.env.tokenCalculator.calculateConcreteListTokens([
              n,
            ]),
          })),
        });

        this.eventBus.emitProcessorResult({
          processorId: processor.id,
          targets: allowedTargets,
          returnedNodes,
        });
      } catch (error) {
        debugLogger.error(
          `Pipeline ${pipeline.name} failed async at ${processor.id}:`,
          error,
        );
        return;
      }
    }

    this.env.inbox.drainConsumed(inboxSnapshot.getConsumedIds());
  }
}
