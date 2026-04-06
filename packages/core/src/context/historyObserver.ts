/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentChatHistory, HistoryEvent } from '../core/agentChatHistory.js';
import { IrMapper } from './ir/mapper.js';
import type { ContextTokenCalculator } from './utils/contextTokenCalculator.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';

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
    private readonly tokenCalculator: ContextTokenCalculator,
  ) {}

  start() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
    }

    this.unsubscribeHistory = this.chatHistory.subscribe((_event: HistoryEvent) => {
      // Rebuild the pristine IR graph from the full source history on every change.
      const pristineEpisodes = IrMapper.toIr(this.chatHistory.get(), this.tokenCalculator);
      this.tracer.logEvent('HistoryObserver', 'Rebuilt pristine graph from chat history update', { episodeCount: pristineEpisodes.length });
      
      this.eventBus.emitPristineHistoryUpdated({ episodes: pristineEpisodes });
    });
  }

  stop() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = undefined;
    }
  }
}
