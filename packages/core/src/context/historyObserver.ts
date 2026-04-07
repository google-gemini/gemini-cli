/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentChatHistory,
  HistoryEvent,
} from '../core/agentChatHistory.js';
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

  private seenNodeIds = new Set<string>();

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

    this.unsubscribeHistory = this.chatHistory.subscribe(
      (_event: HistoryEvent) => {
        // Rebuild the pristine IR graph from the full source history on every change.
        const pristineEpisodes = IrMapper.toIr(
          this.chatHistory.get(),
          this.tokenCalculator,
        );
        
        const newNodes = new Set<string>();
        for (const ep of pristineEpisodes) {
          if (!this.seenNodeIds.has(ep.id)) {
            newNodes.add(ep.id);
            this.seenNodeIds.add(ep.id);
          }
          if (!this.seenNodeIds.has(ep.trigger.id)) {
            newNodes.add(ep.trigger.id);
            this.seenNodeIds.add(ep.trigger.id);
          }
          for (const step of ep.steps) {
            if (!this.seenNodeIds.has(step.id)) {
               newNodes.add(step.id);
               this.seenNodeIds.add(step.id);
            }
          }
          if (ep.yield && !this.seenNodeIds.has(ep.yield.id)) {
             newNodes.add(ep.yield.id);
             this.seenNodeIds.add(ep.yield.id);
          }
        }

        this.tracer.logEvent(
          'HistoryObserver',
          'Rebuilt pristine graph from chat history update',
          { episodeCount: pristineEpisodes.length, newNodesCount: newNodes.size },
        );

        this.eventBus.emitPristineHistoryUpdated({
          episodes: pristineEpisodes,
          newNodes,
        });
      },
    );
  }

  stop() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = undefined;
    }
  }
}
