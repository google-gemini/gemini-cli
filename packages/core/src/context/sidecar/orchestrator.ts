/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../ir/types.js';
import type { ContextWorker } from '../pipeline.js';
import type { PipelineDef, PipelineTrigger } from './types.js';
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

  constructor(
    private readonly pipelines: PipelineDef[],
    private readonly workers: ContextWorker[],
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
  ) {
    this.setupTriggers();
    this.startWorkers();
  }

  private isNodeAllowed(
    node: ConcreteNode,
    triggerTargets: ReadonlySet<string>,
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ): boolean {
    return (
      triggerTargets.has(node.id) &&
      !protectedLogicalIds.has(node.id) &&
      (!node.logicalParentId || !protectedLogicalIds.has(node.logicalParentId))
    );
  }

  private startWorkers() {
    for (const worker of this.workers) {
      try {
        worker.start();
      } catch (e) {
        debugLogger.error(`Worker ${worker.name} failed to start:`, e);
      }
    }
  }

  private setupTriggers() {
    // 1. Pipeline Triggers
    for (const pipeline of this.pipelines) {
      for (const trigger of pipeline.triggers) {
        if (typeof trigger === 'object' && trigger.type === 'timer') {
          const timer = setInterval(() => {
            // Background timers not fully implemented in V1 yet
          }, trigger.intervalMs);
          this.activeTimers.push(timer);
        } else if (trigger === 'retained_exceeded') {
          this.eventBus.onConsolidationNeeded((event) => {
            void this.executePipelineAsync(
              pipeline,
              event.nodes,
              event.targetNodeIds,
              new Set(), // protected IDs
            );
          });
        } else if (trigger === 'new_message') {
          this.eventBus.onChunkReceived((event) => {
            void this.executePipelineAsync(
              pipeline,
              event.nodes,
              event.targetNodeIds,
              new Set(), // protected IDs
            );
          });
        }
      }
    }

    // 2. Worker Triggers (onNodesAdded / onNodesAgedOut)
    this.eventBus.onChunkReceived((event) => {
      // Fire all workers that care about new nodes
      for (const worker of this.workers) {
        if (worker.triggers.onNodesAdded) {
          const inboxSnapshot = new InboxSnapshotImpl(
            this.env.inbox.getMessages() || [],
          );
          const targets = event.nodes.filter((n) =>
            event.targetNodeIds.has(n.id),
          );
          // Fire and forget
          worker.execute({ targets, inbox: inboxSnapshot }).catch((e) => {
            debugLogger.error(`Worker ${worker.name} failed onNodesAdded:`, e);
          });
        }
      }
    });

    this.eventBus.onConsolidationNeeded((event) => {
      // Fire all workers that care about aged out nodes
      for (const worker of this.workers) {
        if (worker.triggers.onNodesAgedOut) {
          const inboxSnapshot = new InboxSnapshotImpl(
            this.env.inbox.getMessages() || [],
          );
          const targets = event.nodes.filter((n) =>
            event.targetNodeIds.has(n.id),
          );
          // Fire and forget
          worker.execute({ targets, inbox: inboxSnapshot }).catch((e) => {
            debugLogger.error(
              `Worker ${worker.name} failed onNodesAgedOut:`,
              e,
            );
          });
        }
      }
    });
  }

  shutdown() {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
    for (const worker of this.workers) {
      try {
        worker.stop();
      } catch (e) {
        debugLogger.error(`Worker ${worker.name} failed to stop:`, e);
      }
    }
  }

  async executeTriggerSync(
    trigger: PipelineTrigger,
    nodes: readonly ConcreteNode[],
    triggerTargets: ReadonlySet<string>,
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ): Promise<readonly ConcreteNode[]> {
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
          );

          const allowedTargets = currentBuffer.nodes.filter((n) =>
            this.isNodeAllowed(n, triggerTargets, protectedLogicalIds),
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
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ) {
    this.tracer.logEvent(
      'Orchestrator',
      `Triggering async pipeline: ${pipeline.name}`,
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
        );

        const allowedTargets = currentBuffer.nodes.filter((n) =>
          this.isNodeAllowed(n, triggerTargets, protectedLogicalIds),
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
