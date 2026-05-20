/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ConcreteNode } from './types.js';
import { ContextGraphBuilder } from './toGraph.js';
import type { HistoryEvent, HistoryTurn } from '../../core/agentChatHistory.js';
import { fromGraph } from './fromGraph.js';
import { NodeIdService } from './nodeIdService.js';

export class ContextGraphMapper {
  private readonly idService = new NodeIdService();
  private readonly builder: ContextGraphBuilder;

  constructor() {
    this.builder = new ContextGraphBuilder(this.idService);
  }

  applyEvent(event: HistoryEvent): ConcreteNode[] {
    return this.builder.processHistory(event.payload);
  }

  fromGraph(nodes: readonly ConcreteNode[]): HistoryTurn[] {
    return fromGraph(nodes, this.idService);
  }

  getIdService(): NodeIdService {
    return this.idService;
  }
}
