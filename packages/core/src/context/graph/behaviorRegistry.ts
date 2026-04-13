/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content, Part } from '@google/genai';
import type { ConcreteNode } from './types.js';

export interface NodeSerializationWriter {
  appendContent(content: Content): void;
  appendModelPart(part: Part): void;
  appendUserPart(part: Part): void;
  flushModelParts(): void;
}

export interface NodeBehavior<T extends ConcreteNode = ConcreteNode> {
  readonly type: T['type'];

  /** Serializes the node into the Gemini Content structure. */
  serialize(node: T, writer: NodeSerializationWriter): void;

  /**
   * Generates a structural representation of the node for the purpose
   * of estimating its token cost.
   */
  getEstimatableParts(node: T): Part[];
}

export class NodeBehaviorRegistry {
  private readonly behaviors = new Map<string, NodeBehavior<ConcreteNode>>();

  register<T extends ConcreteNode>(behavior: NodeBehavior<T>) {
    this.behaviors.set(behavior.type, behavior);
  }

  get(type: string): NodeBehavior<ConcreteNode> {
    const behavior = this.behaviors.get(type);
    if (!behavior) {
      throw new Error(`Unregistered Node type: ${type}`);
    }
    return behavior;
  }
}
