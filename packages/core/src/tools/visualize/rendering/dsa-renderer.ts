/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagramData } from '../types.js';
import {
  renderLinkedList,
  renderDoublyLinkedList,
} from './linked-list-renderer.js';
import { renderBinaryTree } from './binary-tree-renderer.js';
import { renderStack, renderQueue } from './stack-queue-renderer.js';

/**
 * Dispatch to dedicated DSA renderer based on diagram.structure.
 * Returns string[] if a dedicated renderer handled it, null otherwise
 * (signals caller to fall back to GridCanvas).
 */
export function renderDSA(diagram: DiagramData): string[] | null {
  if (!diagram.structure) return null;

  // Extract raw node/edge data for renderers
  const nodes = diagram.nodes.map((n) => ({ id: n.id, label: n.label }));
  const edges = diagram.edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  switch (diagram.structure) {
    case 'linked-list':
      return renderLinkedList(nodes, edges);
    case 'doubly-linked-list':
      return renderDoublyLinkedList(nodes, edges);
    case 'binary-tree':
      return renderBinaryTree(nodes, edges);
    case 'stack':
      return renderStack(nodes, edges);
    case 'queue':
      return renderQueue(nodes, edges);
    case 'graph':
    case 'flowchart':
    default:
      return null;
  }
}
