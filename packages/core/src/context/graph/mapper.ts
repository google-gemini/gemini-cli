/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ConcreteNode } from './types.js';
import { ContextGraphBuilder } from './toGraph.js';
import type { Content } from '@google/genai';
import type { HistoryEvent } from '../../core/agentChatHistory.js';
import { fromGraph } from './fromGraph.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { NodeBehaviorRegistry } from './behaviorRegistry.js';

export class ContextGraphMapper {
  private readonly nodeIdentityMap = new WeakMap<object, string>();

  constructor(private readonly registry: NodeBehaviorRegistry) {}

  private builder?: ContextGraphBuilder;

  applyEvent(
    event: HistoryEvent,
    tokenCalculator: ContextTokenCalculator,
  ): ConcreteNode[] {
    if (!this.builder) {
      this.builder = new ContextGraphBuilder(
        tokenCalculator,
        this.nodeIdentityMap,
      );
    }

    if (event.type === 'CLEAR') {
      this.builder.clear();
      return [];
    }

    if (event.type === 'SYNC_FULL') {
      this.builder.clear();
    }

    this.builder.processHistory(event.payload);
    return this.builder.getNodes();
  }

  fromGraph(nodes: readonly ConcreteNode[]): Content[] {
    return fromGraph(nodes, this.registry);
  }
}
