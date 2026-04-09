/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../ir/types.js';
import type {
  ContextProcessor,
  ContextWorker,
} from '../pipeline.js';
import type { SidecarConfig, PipelineDef, PipelineTrigger } from './types.js';
import type {
  ContextEnvironment,
  ContextEventBus,
  ContextTracer,
} from './environment.js';
import type { SidecarRegistry } from './registry.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { InboxSnapshotImpl } from './inbox.js';
import { ContextWorkingBufferImpl } from './contextWorkingBuffer.js';

export class PipelineOrchestrator {
  private activeTimers: NodeJS.Timeout[] = [];
  private readonly instantiatedProcessors = new Map<string, ContextProcessor>();
  private readonly instantiatedWorkers = new Map<string, ContextWorker>();

  constructor(
    private readonly config: SidecarConfig,
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
    private readonly registry: SidecarRegistry,
  ) {
    this.instantiateProcessors();
    this.instantiateWorkers();
    this.setupTriggers();
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

  private instantiateProcessors() {
    for (const pipeline of this.config.pipelines) {
      for (const procDef of pipeline.processors) {
        if (!this.instantiatedProcessors.has(procDef.processorId)) {
          const factory = this.registry.getProcessor(procDef.processorId);
          const instance = factory.create(this.env, procDef.options || {});
          this.instantiatedProcessors.set(procDef.processorId, instance);
        }
      }
    }
  }

  private instantiateWorkers() {
    if (!this.config.workers) return;
    for (const workerDef of this.config.workers) {
      if (!this.instantiatedWorkers.has(workerDef.workerId)) {
        const factory = this.registry.getWorker(workerDef.workerId);
        const instance = factory.create(this.env, workerDef.options || {});
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
      for (const worker of this.instantiatedWorkers.values()) {
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
      for (const worker of this.instantiatedWorkers.values()) {
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

    // We don't have a formal event bus for inbox publish yet, but we will soon.
    // For now the workers are just registered.
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
    protectedLogicalIds: ReadonlySet<string> = new Set(),
  ): Promise<readonly ConcreteNode[]> {
    let currentBuffer = ContextWorkingBufferImpl.initialize(nodes);
    const pipelines = this.config.pipelines.filter((p) =>
      p.triggers.includes(trigger),
    );

    // Freeze the inbox for this pipeline run
    const inboxSnapshot = new InboxSnapshotImpl(
      this.env.inbox.getMessages() || [],
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
            `Synchronous processor ${procDef.processorId} failed:`,
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

    for (const procDef of pipeline.processors) {
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        this.tracer.logEvent(
          'Orchestrator',
          `Executing processor: ${procDef.processorId} (async)`,
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
          `Pipeline ${pipeline.name} failed async at ${procDef.processorId}:`,
          error,
        );
        return;
      }
    }

    this.env.inbox.drainConsumed(inboxSnapshot.getConsumedIds());
  }
}
