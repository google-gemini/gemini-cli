/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';


import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Episode } from './ir/types.js';

import { ContextEventBus } from './eventBus.js';
import { ContextTracer } from './tracer.js';



import type { ContextEnvironment } from './sidecar/environment.js';

import type { SidecarConfig } from './sidecar/types.js';
import { ProcessorRegistry } from './sidecar/registry.js';
import { PipelineOrchestrator } from './sidecar/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';
import { calculateEpisodeListTokens } from './utils/contextTokenCalculator.js';
import { generateWorkingBufferView } from './ir/graphUtils.js';


import { ToolMaskingProcessor } from './processors/toolMaskingProcessor.js';
import { BlobDegradationProcessor } from './processors/blobDegradationProcessor.js';
import { SemanticCompressionProcessor } from './processors/semanticCompressionProcessor.js';
import { HistorySquashingProcessor } from './processors/historySquashingProcessor.js';
import { StateSnapshotProcessor } from './processors/stateSnapshotProcessor.js';
import { EmergencyTruncationProcessor } from './processors/emergencyTruncationProcessor.js';

import { IrProjector } from './ir/projector.js';

export class ContextManager {
  
  
  // The stateful, pristine Episodic Intermediate Representation graph.
  // This allows the agent to remember and summarize continuously without losing data across turns.
  private pristineEpisodes: Episode[] = [];
  private readonly eventBus: ContextEventBus;
  
  
  // Internal sub-components
  // Synchronous processors are instantiated but effectively used as singletons within this class
  private orchestrator: PipelineOrchestrator;
  private historyObserver?: HistoryObserver;
  
  

  constructor(private sidecar: SidecarConfig, private env: ContextEnvironment, private readonly tracer: ContextTracer) {
    
    
    this.eventBus = new ContextEventBus();
    if ('setEventBus' in this.env) {
       (this.env as any).setEventBus(this.eventBus);
    }
    
    // Register built-ins BEFORE creating Orchestrator
    ProcessorRegistry.register({ id: 'ToolMaskingProcessor', create: (env, opts) => new ToolMaskingProcessor(env, opts as any) });
    ProcessorRegistry.register({ id: 'BlobDegradationProcessor', create: (env, opts) => new BlobDegradationProcessor(env) });
    ProcessorRegistry.register({ id: 'SemanticCompressionProcessor', create: (env, opts) => new SemanticCompressionProcessor(env, opts as any) });
    ProcessorRegistry.register({ id: 'HistorySquashingProcessor', create: (env, opts) => new HistorySquashingProcessor(env, opts as any) });
    ProcessorRegistry.register({ id: 'StateSnapshotProcessor', create: (env, opts) => StateSnapshotProcessor.create(env, opts as any) });
    ProcessorRegistry.register({ id: 'EmergencyTruncationProcessor', create: (env, opts) => EmergencyTruncationProcessor.create(env, opts as any) });

    this.orchestrator = new PipelineOrchestrator(this.sidecar, this.env, this.eventBus, this.tracer);

    this.eventBus.onVariantReady((event) => {
      
      // Find the target episode in the pristine graph
      const targetEp = this.pristineEpisodes.find(
        (ep) => ep.id === event.targetId,
      );
      if (targetEp) {
        if (!targetEp.variants) {
          targetEp.variants = {};
        }
        targetEp.variants[event.variantId] = event.variant;
        this.tracer.logEvent('ContextManager', `Received async variant [${event.variantId}] for Episode ${event.targetId}`);
        debugLogger.log(
          `ContextManager: Received async variant [${event.variantId}] for Episode ${event.targetId}.`,
        );
      }
    });
  }

  /**
   * Safely stops background workers and clears event listeners.
   */
  shutdown() {
    this.orchestrator.shutdown();
    if (this.historyObserver) {
      this.historyObserver.stop();
    }
  }

  /**
   * Subscribes to the core AgentChatHistory to natively track all message events,
   * converting them seamlessly into pristine Episodes.
   */
  subscribeToHistory(chatHistory: AgentChatHistory) {
    if (this.historyObserver) {
      this.historyObserver.stop();
    }

    this.historyObserver = new HistoryObserver(
      chatHistory,
      this.eventBus,
      this.tracer,
      this.sidecar,
      (episodes) => { this.pristineEpisodes = episodes; },
      () => this.getWorkingBufferView(),
      (episodes) => calculateEpisodeListTokens(episodes)
    );

    this.historyObserver.start();
  }

  /**
   * Generates a computed view of the pristine log.
   * Sweeps backwards (newest to oldest), tracking rolling tokens.
   * When rollingTokens > retainedTokens, it injects the "best" available ready variant 
   * (snapshot > summary > masked) instead of the raw text.
   * Handles N-to-1 variant skipping automatically.
   */
  public getWorkingBufferView(): Episode[] {
    return generateWorkingBufferView(
      this.pristineEpisodes,
      this.sidecar.budget.retainedTokens,
      this.tracer
    );
  }

  /**
   * Returns a temporary, compressed Content[] array to be used exclusively for the LLM request.
   * This does NOT mutate the pristine episodic graph.
   */
  async projectCompressedHistory(): Promise<Content[]> {
    this.tracer.logEvent('ContextManager', 'Projection requested.');
    const protectedIds = new Set<string>();
    if (this.pristineEpisodes.length > 0) {
      protectedIds.add(this.pristineEpisodes[0].id); // Structural invariant
    }
    
    return IrProjector.project(
      this.getWorkingBufferView(),
      this.orchestrator,
      this.sidecar,
      this.tracer,
      this.env,
      protectedIds
    );
  }
}
