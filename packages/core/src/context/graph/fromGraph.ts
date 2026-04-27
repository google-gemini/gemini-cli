/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content, Part } from '@google/genai';
import type { ConcreteNode } from './types.js';
import type {
  NodeSerializationWriter,
  NodeBehaviorRegistry,
} from './behaviorRegistry.js';

import { debugLogger } from '../../utils/debugLogger.js';

class NodeSerializer implements NodeSerializationWriter {
  private history: Content[] = [];
  private currentModelParts: Part[] = [];

  appendContent(content: Content) {
    this.flushModelParts();
    this.history.push(content);
  }

  appendModelPart(part: Part) {
    this.currentModelParts.push(part);
  }

  appendUserPart(part: Part) {
    this.flushModelParts();
    this.history.push({ role: 'user', parts: [part] });
  }

  flushModelParts() {
    if (this.currentModelParts.length > 0) {
      this.history.push({ role: 'model', parts: [...this.currentModelParts] });
      this.currentModelParts = [];
    }
  }

  getContents(): Content[] {
    this.flushModelParts();
    return this.history;
  }
}

export function fromGraph(
  nodes: readonly ConcreteNode[],
  registry: NodeBehaviorRegistry,
): Content[] {
  debugLogger.log(`[fromGraph] Serializing ${nodes.length} nodes`);
  const writer = new NodeSerializer();
  for (const node of nodes) {
    const behavior = registry.get(node.type);
    if (!behavior) {
      debugLogger.error(`[fromGraph] NO BEHAVIOR FOUND for node type: ${node.type}`);
      continue;
    }
    behavior.serialize(node, writer);
  }
  const result = writer.getContents();
  debugLogger.log(`[fromGraph] Generated ${result.length} contents`);
  return result;
}
