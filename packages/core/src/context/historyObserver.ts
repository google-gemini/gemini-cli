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
        // Wait, toIr still returns an Episode[].
        // We actually need to map the Episode[] to a flat ConcreteNode[] here to form the 'ship'.
        const pristineEpisodes = IrMapper.toIr(
          this.chatHistory.get(),
          this.tokenCalculator,
        );

        const ship: import('./ir/types.js').ConcreteNode[] = [];
        for (const ep of pristineEpisodes) {
          if (ep.concreteNodes) {
            for (const child of ep.concreteNodes) {
              ship.push(child);
            }
          }
        }

        const newNodes = new Set<string>();
        for (const node of ship) {
          if (!this.seenNodeIds.has(node.id)) {
            newNodes.add(node.id);
            this.seenNodeIds.add(node.id);
          }
        }

        this.tracer.logEvent(
          'HistoryObserver',
          'Rebuilt pristine graph from chat history update',
          { shipSize: ship.length, newNodesCount: newNodes.size },
        );

        this.eventBus.emitPristineHistoryUpdated({
          ship,
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
