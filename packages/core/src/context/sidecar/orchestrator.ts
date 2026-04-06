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
             // For background timers, we need a way to get the latest state
             // But timers are generally disabled right now via the triggers config.
             // If needed, we will pass it via event bus.
          }, trigger.intervalMs);
          this.activeTimers.push(timer);
        } else if (trigger === 'budget_exceeded') {
          this.eventBus.onConsolidationNeeded((event) => {
             const state: ContextAccountingState = {
                currentTokens: 0,
                retainedTokens: this.config.budget.retainedTokens,
                maxTokens: this.config.budget.maxTokens,
                isBudgetSatisfied: false,
                deficitTokens: event.targetDeficit,
                protectedEpisodeIds: new Set()
             };
             this.executePipelineAsync(pipeline, event.episodes, state);
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
   * Executes a pipeline asynchronously in the background. This is the "Eventual Consistency" path.
   * When the pipeline resolves, it emits a VariantReady event to cache the new graph.
   */
  /**
   * Executes a pipeline based on its configured execution strategy ('blocking' or 'background').
   */
  async executePipeline(pipelineName: string, episodes: Episode[], state: ContextAccountingState): Promise<Episode[]> {
    const pipeline = this.config.pipelines.find(p => p.name === pipelineName);
    if (!pipeline) return episodes;

    if (pipeline.execution === 'background') {
       this.executePipelineAsync(pipeline, episodes, state).catch(e => {
          debugLogger.error(`Background pipeline ${pipeline.name} failed:`, e);
       });
       return episodes; // Return immediately
    }

    // Blocking execution
    let currentEpisodes = [...episodes];
    for (let i = 0; i < pipeline.processors.length; i++) {
      const procDef = pipeline.processors[i];
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        currentEpisodes = await processor.process(currentEpisodes, state);
      } catch (error) {
        debugLogger.error(`Pipeline ${pipeline.name} failed synchronously at ${procDef.processorId}:`, error);
        return currentEpisodes; // Return what we have so far
      }
    }

    return currentEpisodes;
  }

  /**
   * Internal method for running a pipeline entirely in the background.
   */
  private async executePipelineAsync(pipeline: PipelineDef, currentState: Episode[], state: ContextAccountingState) {
    this.tracer.logEvent('Orchestrator', `Triggering async pipeline: ${pipeline.name}`);
    if (!currentState || currentState.length === 0) return;

    let currentEpisodes = [...currentState];

    for (const procDef of pipeline.processors) {
      const processor = this.instantiatedProcessors.get(procDef.processorId);
      if (!processor) continue;

      try {
        currentEpisodes = await processor.process(currentEpisodes, state);
      } catch (error) {
        debugLogger.error(`Pipeline ${pipeline.name} failed at ${procDef.processorId}:`, error);
        return; // Halt pipeline
      }
    }
  }
}
