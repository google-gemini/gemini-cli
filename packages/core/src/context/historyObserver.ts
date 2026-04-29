/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentChatHistory,
  HistoryEvent,
} from '../core/agentChatHistory.js';
import type { ContextGraphMapper } from './graph/mapper.js';
import type { ContextEventBus } from './eventBus.js';
import type { ContextTracer } from './tracer.js';

/**
 * Connects the raw AgentChatHistory to the ContextManager.
 * It maps raw messages into Episodic Intermediate Representation (Context Graph)
 * and evaluates background triggers whenever history changes.
 */
export class HistoryObserver {
  private unsubscribeHistory?: () => void;

  private readonly seenNodeIds = new Set<string>();

  constructor(
    private readonly chatHistory: AgentChatHistory,
    private readonly eventBus: ContextEventBus,
    private readonly tracer: ContextTracer,
    private readonly graphMapper: ContextGraphMapper,
  ) {}

  private processEvent = (event: HistoryEvent) => {
    if (event.type === 'CLEAR') {
      this.seenNodeIds.clear();
    }

    if (event.type === 'SILENT_SYNC') {
      return;
    }

    // Always process the FULL history to provide a complete view to the ContextManager.
    // The ContextManager relies on the 'nodes' array to be the TOTAL set of valid pristine nodes.
    const fullHistory = this.chatHistory.get();
    const nodes = this.graphMapper.applyEvent({
      ...event,
      payload: fullHistory,
    });

    const newNodes = new Set<string>();
    for (const node of nodes) {
      if (!this.seenNodeIds.has(node.id)) {
        newNodes.add(node.id);
        this.seenNodeIds.add(node.id);
      }
    }

    this.tracer.logEvent(
      'HistoryObserver',
      `Rebuilt pristine graph from ${event.type} event`,
      { nodesSize: nodes.length, newNodesCount: newNodes.size },
    );

    this.eventBus.emitPristineHistoryUpdated({
      nodes,
      newNodes,
    });
  };

  start() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
    }

    this.unsubscribeHistory = this.chatHistory.subscribe(this.processEvent);

    // Process any existing history immediately upon start
    const existing = this.chatHistory.get();
    if (existing && existing.length > 0) {
      this.processEvent({ type: 'SYNC_FULL', payload: existing });
    }
  }

  stop() {
    if (this.unsubscribeHistory) {
      this.unsubscribeHistory();
      this.unsubscribeHistory = undefined;
    }
  }
}
