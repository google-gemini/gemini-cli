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

export class ContextGraphMapper {
  private readonly nodeIdentityMap = new WeakMap<object, string>();
  private readonly builder: ContextGraphBuilder;

  constructor() {
    this.builder = new ContextGraphBuilder(this.nodeIdentityMap);
  }

  applyEvent(event: HistoryEvent): ConcreteNode[] {
    return this.builder.processHistory(event.payload);
  }

  fromGraph(nodes: readonly ConcreteNode[]): Content[] {
    return fromGraph(nodes);
  }
}
