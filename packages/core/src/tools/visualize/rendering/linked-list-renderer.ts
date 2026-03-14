/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface NodeInput {
  id: string;
  label: string;
}

interface EdgeInput {
  source: string;
  target: string;
}

/**
 * Render a singly linked list as horizontal chain with arrows.
 *
 *  ┌──────┐     ┌──────┐     ┌──────┐
 *  │  10  │────→│  20  │────→│  30  │────→ null
 *  └──────┘     └──────┘     └──────┘
 */
export function renderLinkedList(
  nodes: NodeInput[],
  edges: EdgeInput[],
): string[] {
  const order = getChainOrder(nodes, edges);
  if (order.length === 0) return ['(empty list)'];

  const gap = '────→';
  const nodeBoxes = order.map((n) => makeBox(n.label));
  const suffix = '────→ null';

  const lines: string[] = ['', '', ''];

  for (let i = 0; i < nodeBoxes.length; i++) {
    const box = nodeBoxes[i];
    lines[0] += box[0];
    lines[1] += box[1];
    lines[2] += box[2];

    if (i < nodeBoxes.length - 1) {
      lines[0] += pad(gap.length);
      lines[1] += gap;
      lines[2] += pad(gap.length);
    }
  }

  // Append null pointer
  lines[0] += pad(suffix.length);
  lines[1] += suffix;
  lines[2] += pad(suffix.length);

  return lines;
}

/**
 * Render a doubly linked list with parallel forward/backward arrows.
 *
 *           ┌──────┐ ────→ ┌──────┐ ────→ ┌──────┐
 *  null ←── │  10  │       │  20  │       │  30  │ ──→ null
 *           └──────┘ ←──── └──────┘ ←──── └──────┘
 */
export function renderDoublyLinkedList(
  nodes: NodeInput[],
  edges: EdgeInput[],
): string[] {
  const order = getChainOrder(nodes, edges);
  if (order.length === 0) return ['(empty list)'];

  const fwdArrow = ' ────→ ';
  const bwdArrow = ' ←──── ';
  const prefix = 'null ←── ';
  const suffix = ' ──→ null';

  const lines: string[] = ['', '', ''];
  const prefixPad = pad(prefix.length);

  // Prefix
  lines[0] += prefixPad;
  lines[1] += prefix;
  lines[2] += prefixPad;

  for (let i = 0; i < order.length; i++) {
    const box = makeBox(order[i].label);
    lines[0] += box[0];
    lines[1] += box[1];
    lines[2] += box[2];

    if (i < order.length - 1) {
      lines[0] += fwdArrow;
      lines[1] += pad(fwdArrow.length);
      lines[2] += bwdArrow;
    }
  }

  // Suffix
  lines[0] += pad(suffix.length);
  lines[1] += suffix;
  lines[2] += pad(suffix.length);

  return lines;
}

function makeBox(label: string): [string, string, string] {
  const inner = label.length + 2; // 1 space padding each side
  // + borders
  const top = '┌' + '─'.repeat(inner) + '┐';
  const mid = '│' + ' ' + center(label, inner - 1) + '│';
  const bot = '└' + '─'.repeat(inner) + '┘';
  return [top, mid, bot];
}

function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
}

function pad(n: number): string {
  return ' '.repeat(n);
}

/**
 * Determine the order of nodes in a chain by following edges from the head.
 * Head = node with no incoming edges (or first node if cycle).
 */
function getChainOrder(nodes: NodeInput[], edges: EdgeInput[]): NodeInput[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build forward adjacency (only forward edges for doubly-linked)
  // For DLL, there are pairs A->B and B->A. We want the "forward" direction.
  // Heuristic: forward = edges in the order they appear, deduplicated by pair
  const incoming = new Set<string>();
  const next = new Map<string, string>();

  // Count incoming edges per node
  for (const e of edges) {
    incoming.add(e.target);
  }

  // For DLL, pick only forward edges (source has fewer incoming)
  const edgeSet = new Set(edges.map((e) => `${e.source}->${e.target}`));
  for (const e of edges) {
    const reverse = `${e.target}->${e.source}`;
    if (edgeSet.has(reverse)) {
      // Bidirectional - only add if not already mapped
      if (!next.has(e.source) && !next.has(e.target)) {
        next.set(e.source, e.target);
      }
    } else {
      // Unidirectional
      next.set(e.source, e.target);
    }
  }

  // Find head: node not targeted by any forward edge
  const forwardTargets = new Set(next.values());
  let head = nodes[0].id;
  for (const n of nodes) {
    if (!forwardTargets.has(n.id)) {
      head = n.id;
      break;
    }
  }

  // Traverse
  const result: NodeInput[] = [];
  const visited = new Set<string>();
  let current: string | undefined = head;
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = nodeMap.get(current);
    if (node) result.push(node);
    current = next.get(current);
  }

  // Add any unvisited nodes at the end
  for (const n of nodes) {
    if (!visited.has(n.id)) result.push(n);
  }

  return result;
}
