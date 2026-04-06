/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode } from '../ir/types.js';
import type { ContextProcessor, ContextAccountingState } from '../pipeline.js';
import type { SidecarConfig, PipelineDef } from './types.js';
import type { ContextEnvironment, ContextEventBus, ContextTracer } from './environment.js';
import { ProcessorRegistry } from './registry.js';
import { debugLogger } from '../../utils/debugLogger.js';

export class PipelineOrchestrator {
  private activeTimers: NodeJS.Timeout[] = [];
  private readonly instantiatedProcessors = new Map<string, ContextProcessor>();

  constructor(
    private readonly config: SidecarConfig,
    private readonly env: ContextEnvironment,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer
  ) {
    this.instantiateProcessors();
    this.registerTriggers();
  }

  /**
   * Pre-loads and configures all processors defined in the sidecar config.
   */
  private instantiateProcessors() {
    for (const pipeline of this.config.pipelines) {
      for (const procDef of pipeline.processors) {
        if (!this.instantiatedProcessors.has(procDef.processorId)) {
          const processorClass = ProcessorRegistry.get(procDef.processorId);
          if (!processorClass) {
            throw new Error(`Unknown processor ID: ${procDef.processorId}`);
          }
          // The Orchestrator injects standard dependencies required by processors
          // If a processor needs the eventBus (like Snapshot), it expects it via constructor.
          const instance = processorClass.create(this.env, procDef.options) as unknown as ContextProcessor;
          this.instantiatedProcessors.set(procDef.processorId, instance);
        }
      }
    }
  }

  /**
   * Sets up listeners for the triggers defined in the SidecarConfig.
   */
  private registerTriggers() {
    for (const pipeline of this.config.pipelines) {
      for (const trigger of pipeline.triggers) {
        if (typeof trigger === 'object' && trigger.type === 'timer') {
          const timer = setInterval(() => {
             this.executePipelineAsync(pipeline);
          }, trigger.intervalMs);
          this.activeTimers.push(timer);
        } else if (trigger === 'budget_exceeded') {
          this.eventBus.onConsolidationNeeded(() => {
             this.executePipelineAsync(pipeline);
          });
        }
        // 'on_turn' and 'post_turn' are handled synchronously via direct calls from the ContextManager.
      }
    }
  }

  /**
   * Executes a pipeline asynchronously in the background. This is the "Eventual Consistency" path.
   * When the pipeline resolves, it emits a VariantReady event to cache the new graph.
   */
  private async executePipelineAsync(pipeline: PipelineDef) {
    this.tracer.logEvent('Orchestrator', `Triggering async pipeline: ${pipeline.name}`);
    // Retrieve the most recent pristine state from the bus.
    // The EventBus must hold the current graph state for orchestrated async execution.
    const currentState = []; 
    if (!currentState || currentState.length === 0) return;

    // We assume the eventBus or ContextManager keeps accounting state updated.
    const state: ContextAccountingState = {
      currentTokens: 0,
       // This needs to be calculated or passed down. For now, processors re-calculate.
      retainedTokens: this.config.budget.retainedTokens,
      maxTokens: this.config.budget.maxTokens,
      isBudgetSatisfied: false,
      deficitTokens: 0,
      protectedEpisodeIds: new Set()
    };

    let currentEpisodes = [...currentState];

    for (const procDef of pipeline.processors) {
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        const result = processor.process(currentEpisodes, state);
        if (result instanceof Promise) {
          currentEpisodes = await result;
        } else {
          currentEpisodes = result;
        }
      } catch (error) {
        debugLogger.error(`Pipeline ${pipeline.name} failed at ${procDef.processorId}:`, error);
        return; // Halt pipeline
      }
    }

    // Success! The background pipeline finished.
    // Instead of forcing the Orchestrator to emit complex variant geometries,
    // we can just emit a "GraphUpdated" or standard "VariantReady" event containing the entire new subset.
    // For simplicity right now, if a pipeline runs asynchronously, we emit a "GraphVariant" event.
    // this.eventBus.emitGraphVariantReady(currentEpisodes);
  }

  /**
   * Executes a pipeline synchronously. If any processor returns a Promise, this method
   * automatically forks that Promise to the background (falling back to async/eventual consistency)
   * and immediately returns the synchronous results computed up to that point.
   */
  executePipelineForking(pipelineName: string, episodes: Episode[], state: ContextAccountingState): Episode[] {
    const pipeline = this.config.pipelines.find(p => p.name === pipelineName);
    if (!pipeline) return episodes;

    let currentEpisodes = [...episodes];

    for (let i = 0; i < pipeline.processors.length; i++) {
      const procDef = pipeline.processors[i];
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        const result = processor.process(currentEpisodes, state);
        if (result instanceof Promise) {
          // *** THE FORK ***
          // A processor went Async. We halt the synchronous chain here and return the state as-is.
          this.tracer.logEvent('Orchestrator', `Pipeline ${pipeline.name} forked to background at ${procDef.processorId}`);
          
          // Continue resolving the rest of the pipeline in the background.
          this.continuePipelineAsync(pipeline, result, i + 1, state).catch(e => {
             debugLogger.error(`Background fork of ${pipeline.name} failed:`, e);
          });
          
          // Return the strictly synchronous output back to the LLM immediately!
          return currentEpisodes;
        } else {
          currentEpisodes = result;
        }
      } catch (error) {
        debugLogger.error(`Pipeline ${pipeline.name} failed synchronously at ${procDef.processorId}:`, error);
        return currentEpisodes; // Return what we have so far
      }
    }

    return currentEpisodes;
  }

  private async continuePipelineAsync(pipeline: PipelineDef, asyncResult: Promise<Episode[]>, startIndex: number, state: ContextAccountingState) {
    let currentEpisodes = await asyncResult;

    for (let i = startIndex; i < pipeline.processors.length; i++) {
      const procDef = pipeline.processors[i];
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      const result = processor.process(currentEpisodes, state);
      if (result instanceof Promise) {
        currentEpisodes = await result;
      } else {
        currentEpisodes = result;
      }
    }

    // this.eventBus.emitGraphVariantReady(currentEpisodes);
  }

  shutdown() {
    this.activeTimers.forEach(clearInterval);
  }
}
