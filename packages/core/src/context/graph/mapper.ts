/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { Episode, ConcreteNode } from './types.js';
import { toGraph } from './toGraph.js';
import { fromGraph } from './fromGraph.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { NodeBehaviorRegistry } from './behaviorRegistry.js';

export class ContextGraphMapper {
  private readonly nodeIdentityMap = new WeakMap<object, string>();

  constructor(private readonly registry: NodeBehaviorRegistry) {}

  toGraph(
    history: readonly Content[],
    tokenCalculator: ContextTokenCalculator,
  ): Episode[] {
    return toGraph(history, tokenCalculator, this.nodeIdentityMap);
  }

  fromGraph(nodes: readonly ConcreteNode[]): Content[] {
    return fromGraph(nodes, this.registry);
  }
}
