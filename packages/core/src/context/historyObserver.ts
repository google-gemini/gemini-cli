/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentChatHistory, HistoryEvent } from '../core/agentChatHistory.js';
import { IrMapper } from './ir/mapper.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';
import type { SidecarConfig } from './sidecar/types.js';
import type { Episode } from './ir/types.js';

/**
 * Connects the raw AgentChatHistory to the ContextManager.
 * It maps raw messages into Episodic Intermediate Representation (IR)
 * and evaluates background triggers whenever history changes.
 */
export class HistoryObserver {
  private unsubscribeHistory?: () => void;

  constructor(
    private readonly chatHistory: AgentChatHistory,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
    private readonly sidecar: SidecarConfig,
    private readonly onIrRebuilt: (episodes: Episode[]) => void,
    private readonly computeWorkingBuffer: () => Episode[],
    private readonly calculateIrTokens: (episodes: Episode[]) => number,
  ) {}

  start() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
    }

    this.unsubscribeHistory = this.chatHistory.subscribe((_event: HistoryEvent) => {
      // Rebuild the pristine IR graph from the full source history on every change.
      const pristineEpisodes = IrMapper.toIr(this.chatHistory.get());
      this.tracer.logEvent('HistoryObserver', 'Rebuilt pristine graph from chat history update', { episodeCount: pristineEpisodes.length });
      
      this.onIrRebuilt(pristineEpisodes);
      this.checkTriggers(pristineEpisodes);
    });
  }

  stop() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = undefined;
    }
  }

  private checkTriggers(pristineEpisodes: Episode[]) {
    if (!this.sidecar.budget) return;

    const workingBuffer = this.computeWorkingBuffer();
    const currentTokens = this.calculateIrTokens(workingBuffer);
    
    this.tracer.logEvent('HistoryObserver', 'Evaluated triggers', { currentTokens, retainedTokens: this.sidecar.budget.retainedTokens });

    // 1. Eager Compute Trigger
    this.eventBus.emitChunkReceived({ episodes: pristineEpisodes });

    // 2. Budget Crossed Trigger
    if (currentTokens > this.sidecar.budget.retainedTokens) {
      const deficit = currentTokens - this.sidecar.budget.retainedTokens;
      this.tracer.logEvent('HistoryObserver', 'Budget crossed. Emitting ConsolidationNeeded', { deficit });
      this.eventBus.emitConsolidationNeeded({
        episodes: workingBuffer, 
        targetDeficit: deficit,
      });
    }
  }
}
