/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../ir/types.js';
import type { ContextProcessor, ContextAccountingState, ContextPatch } from '../pipeline.js';
import type { SidecarConfig, PipelineDef, PipelineTrigger } from './types.js';
import type {
  ContextEnvironment,
  ContextEventBus,
  ContextTracer,
} from './environment.js';
import type { ProcessorRegistry } from './registry.js';
import { debugLogger } from '../../utils/debugLogger.js';

export class PipelineOrchestrator {
  private activeTimers: NodeJS.Timeout[] = [];
  private readonly instantiatedProcessors = new Map<string, ContextProcessor>();

  constructor(
    private readonly config: SidecarConfig,
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
    private readonly registry: ProcessorRegistry,
  ) {
    this.instantiateProcessors();
    this.setupTriggers();
  }

  private instantiateProcessors() {
    for (const pipeline of this.config.pipelines) {
      for (const procDef of pipeline.processors) {
        if (!this.instantiatedProcessors.has(procDef.processorId)) {
          const factory = this.registry.get(procDef.processorId);
          const instance = factory.create(this.env, procDef.options || {});
          this.instantiatedProcessors.set(procDef.processorId, instance);
        }
      }
    }
  }

  private setupTriggers() {
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
            // Note: In a real implementation, event.episodes needs to be mapped to the Concrete Ship
            void this.executePipelineAsync(pipeline, [], event.targetNodeIds, state);
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
            void this.executePipelineAsync(pipeline, [], event.targetNodeIds, state);
          });
        }
      }
    }
  }

  shutdown() {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
  }

  /**
   * Evaluates the subset returned by the processor against the original targets,
   * deducing the removed and inserted nodes, and updating the Ship accordingly.
   */
  applyProcessorDiff(
    ship: ReadonlyArray<ConcreteNode>,
    targets: ReadonlyArray<ConcreteNode>,
    returnedNodes: ReadonlyArray<ConcreteNode>,
  ): ReadonlyArray<ConcreteNode> {
    const mutableShip = [...ship];
    const targetSet = new Set(targets.map(n => n.id));
    const returnedMap = new Map(returnedNodes.map(n => [n.id, n]));

    const removedIds = new Set<string>();
    const newNodes: ConcreteNode[] = [];

    // 1. Identify Removals & Modifications
    // If a target is missing from returnedMap -> Removed
    // If a target is in returnedMap but !== object ref -> Modified (Remove old, Insert new)
    for (const t of targets) {
      const returnedNode = returnedMap.get(t.id);
      if (!returnedNode) {
        removedIds.add(t.id);
      } else if (returnedNode !== t) {
        removedIds.add(t.id);
        newNodes.push(returnedNode);
      }
    }

    // 2. Identify pure Additions (New synthetic nodes)
    for (const r of returnedNodes) {
      if (!targetSet.has(r.id)) {
        newNodes.push(r);
      }
    }

    if (removedIds.size === 0 && newNodes.length === 0) {
       return ship; // No changes
    }

    // Find the earliest index in the ship where a removal occurred so we know where to insert
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

    // Insert new nodes exactly where the old nodes were removed
    if (newNodes.length > 0) {
      // NOTE: Metadata appending (who, what, when) should ideally happen here
      // But for V1, processors still construct the new nodes with metadata inside.
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
    const pipelines = this.config.pipelines.filter((p) => p.triggers.includes(trigger));
    
    for (const pipeline of pipelines) {
      for (const procDef of pipeline.processors) {
        const processor = this.instantiatedProcessors.get(procDef.processorId);
        if (!processor) continue;

        try {
          this.tracer.logEvent(
            'Orchestrator',
            `Executing processor synchronously: ${procDef.processorId}`,
          );

          // 1. Filter out protected nodes
          const allowedTargets = currentShip.filter(n => 
             triggerTargets.has(n.id) && 
             (!n.logicalParentId || !state.protectedLogicalIds.has(n.logicalParentId))
          );
          
          const returnedNodes = await processor.process({
            ship: currentShip,
            targets: allowedTargets,
            state,
            buffer: {} as any, // TODO: Implement ContextWorkingBuffer fully
            inbox: {} as any, // TODO: Implement ContextInbox fully
          });
          
          currentShip = this.applyProcessorDiff(currentShip, allowedTargets, returnedNodes);
          
        } catch (error) {
          debugLogger.error(
            `Synchronous processor ${procDef.processorId} failed:`,
            error,
          );
        }
      }
    }

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

    for (const procDef of pipeline.processors) {
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        this.tracer.logEvent(
          'Orchestrator',
          `Executing processor: ${procDef.processorId} (async)`,
        );

        // 1. Filter out protected nodes
        const allowedTargets = currentShip.filter(n => 
            triggerTargets.has(n.id) && 
            (!n.logicalParentId || !state.protectedLogicalIds.has(n.logicalParentId))
        );

        const returnedNodes = await processor.process({
            ship: currentShip,
            targets: allowedTargets,
            state,
            buffer: {} as any, // TODO: Implement ContextWorkingBuffer fully
            inbox: {} as any, // TODO: Implement ContextInbox fully
        });

        currentShip = this.applyProcessorDiff(currentShip, allowedTargets, returnedNodes);

      } catch (error) {
        debugLogger.error(
          `Pipeline ${pipeline.name} failed async at ${procDef.processorId}:`,
          error,
        );
        return; 
      }
    }
  }
}