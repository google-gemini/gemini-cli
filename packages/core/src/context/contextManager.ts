/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';


import type { AgentChatHistory } from '../core/agentChatHistory.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Episode } from './ir/types.js';

import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';



import type { ContextEnvironment } from './sidecar/environment.js';

import type { SidecarConfig } from './sidecar/types.js';

import { PipelineOrchestrator } from './sidecar/orchestrator.js';
import { HistoryObserver } from './historyObserver.js';

import { generateWorkingBufferView } from './ir/graphUtils.js';









import { IrProjector } from './ir/projector.js';

import './sidecar/builtins.js';

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
    this.eventBus = env.eventBus;
    
    this.orchestrator = new PipelineOrchestrator(this.sidecar, this.env, this.eventBus, this.tracer);

    this.eventBus.onPristineHistoryUpdated((event) => {
      this.pristineEpisodes = event.episodes;
      this.evaluateTriggers();
    });

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
   * Evaluates if the current working buffer exceeds configured budget thresholds,
   * firing consolidation events if necessary.
   */
  private evaluateTriggers() {
    if (!this.sidecar.budget) return;

    const workingBuffer = this.getWorkingBufferView();
    const currentTokens = this.env.tokenCalculator.calculateEpisodeListTokens(workingBuffer);
    
    this.tracer.logEvent('ContextManager', 'Evaluated triggers', { currentTokens, retainedTokens: this.sidecar.budget.retainedTokens });

    // 1. Eager Compute Trigger
    this.eventBus.emitChunkReceived({ episodes: this.pristineEpisodes });

    // 2. Budget Crossed Trigger
    if (currentTokens > this.sidecar.budget.retainedTokens) {
      const deficit = currentTokens - this.sidecar.budget.retainedTokens;
      this.tracer.logEvent('ContextManager', 'Budget crossed. Emitting ConsolidationNeeded', { deficit });
      this.eventBus.emitConsolidationNeeded({
        episodes: workingBuffer, 
        targetDeficit: deficit,
      });
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
      this.env.tokenCalculator,
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
  getWorkingBufferView(): Episode[] {
    return generateWorkingBufferView(
      this.pristineEpisodes,
      this.sidecar.budget.retainedTokens,
      this.tracer,
      this.env
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
