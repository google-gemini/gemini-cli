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
   * Applies an array of ContextPatches to the Ship, returning a new immutable Ship array.
   */
  reduceShip(
    ship: ReadonlyArray<ConcreteNode>,
    patches: ContextPatch[]
  ): ReadonlyArray<ConcreteNode> {
    if (patches.length === 0) return ship;

    const mutableShip = [...ship];
    
    for (const patch of patches) {
      const { removedIds, insertedNodes = [], insertionIndex } = patch;
      
      let targetIdx = insertionIndex ?? -1;
      
      if (targetIdx === -1 && removedIds.length > 0) {
        targetIdx = mutableShip.findIndex(n => n.id === removedIds[0]);
      }
      
      if (targetIdx === -1) {
         targetIdx = mutableShip.length;
      }

      if (removedIds.length > 0) {
        const removeSet = new Set(removedIds);
        let i = 0;
        while (i < mutableShip.length) {
          if (removeSet.has(mutableShip[i].id)) {
            mutableShip.splice(i, 1);
            if (i < targetIdx) targetIdx--;
          } else {
            i++;
          }
        }
      }

      if (insertedNodes.length > 0) {
         mutableShip.splice(targetIdx, 0, ...insertedNodes);
      }
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
          
          const patches = await processor.process({
            ship: currentShip,
            triggerTargets,
            state,
            buffer: {} as any, // TODO: Implement ContextWorkingBuffer fully
            inbox: {} as any, // TODO: Implement ContextInbox fully
          });
          
          currentShip = this.reduceShip(currentShip, patches);
          
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

        const patches = await processor.process({
            ship: currentShip,
            triggerTargets,
            state,
            buffer: {} as any, // TODO: Implement ContextWorkingBuffer fully
            inbox: {} as any, // TODO: Implement ContextInbox fully
        });
        currentShip = this.reduceShip(currentShip, patches);

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