/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
import type { ConcreteNode, NodeType } from './types.js';

export interface NodeBehavior<T extends ConcreteNode = ConcreteNode> {
  readonly type: NodeType;

  /**
   * Generates a structural representation of the node for the purpose
   * of estimating its token cost.
   */
  getEstimatableParts(node: T): Part[];
}

export class NodeBehaviorRegistry {
  private readonly behaviors = new Map<NodeType, NodeBehavior<ConcreteNode>>();

  register<T extends ConcreteNode>(behavior: NodeBehavior<T>) {
    this.behaviors.set(behavior.type, behavior);
  }

  get(type: NodeType): NodeBehavior<ConcreteNode> {
    const behavior = this.behaviors.get(type);
    if (!behavior) {
      throw new Error(`Unregistered Node type: ${type}`);
    }
    return behavior;
  }
}
