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
 * Render a stack as vertical box tower with top indicator.
 *
 *   ┌──────────┐ ← top
 *   │    30    │
 *   ├──────────┤
 *   │    20    │
 *   ├──────────┤
 *   │    10    │
 *   └──────────┘
 */
export function renderStack(nodes: NodeInput[], edges: EdgeInput[]): string[] {
  const order = getChainOrder(nodes, edges);
  if (order.length === 0) return ['(empty stack)'];

  // Stack: last element is top (reverse of chain order)
  const items = [...order].reverse();
  const maxLabel = Math.max(...items.map((n) => n.label.length));
  const innerWidth = maxLabel + 4;

  const lines: string[] = [];

  // Top row with indicator
  lines.push('┌' + '─'.repeat(innerWidth) + '┐ ← top');

  for (let i = 0; i < items.length; i++) {
    const label = centerText(items[i].label, innerWidth);
    lines.push('│' + label + '│');

    if (i < items.length - 1) {
      lines.push('├' + '─'.repeat(innerWidth) + '┤');
    }
  }

  lines.push('└' + '─'.repeat(innerWidth) + '┘');

  return lines;
}

/**
 * Render a queue as horizontal compartment box.
 *
 *  front                        rear
 *    ↓                            ↓
 *  ┌──────┬──────┬──────┬──────┐
 *  │  10  │  20  │  30  │  40  │
 *  └──────┴──────┴──────┴──────┘
 */
export function renderQueue(nodes: NodeInput[], edges: EdgeInput[]): string[] {
  const order = getChainOrder(nodes, edges);
  if (order.length === 0) return ['(empty queue)'];

  const cellWidth = Math.max(...order.map((n) => n.label.length + 2), 4);

  // Build compartmented box
  let topBorder = '┌';
  let midLine = '│';
  let botBorder = '└';

  for (let i = 0; i < order.length; i++) {
    topBorder += '─'.repeat(cellWidth);
    midLine += centerText(order[i].label, cellWidth);
    botBorder += '─'.repeat(cellWidth);

    if (i < order.length - 1) {
      topBorder += '┬';
      midLine += '│';
      botBorder += '┴';
    }
  }

  topBorder += '┐';
  midLine += '│';
  botBorder += '┘';

  // Labels for front and rear
  const totalWidth = topBorder.length;
  const frontLabel = 'front';
  const rearLabel = 'rear';
  const rearPos = Math.max(
    totalWidth - rearLabel.length - 1,
    frontLabel.length + 4,
  );

  const labelLine =
    frontLabel + ' '.repeat(rearPos - frontLabel.length) + rearLabel;
  const arrowLine = '  ↓' + ' '.repeat(rearPos - 3) + '  ↓';

  return [labelLine, arrowLine, topBorder, midLine, botBorder];
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
}

/**
 * Determine chain order from edges. Head = node with no incoming edges.
 */
function getChainOrder(nodes: NodeInput[], edges: EdgeInput[]): NodeInput[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0) return nodes;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const next = new Map<string, string>();
  const incoming = new Set<string>();

  for (const e of edges) {
    next.set(e.source, e.target);
    incoming.add(e.target);
  }

  // Find head
  let head = nodes[0].id;
  for (const n of nodes) {
    if (!incoming.has(n.id)) {
      head = n.id;
      break;
    }
  }

  const result: NodeInput[] = [];
  const visited = new Set<string>();
  let current: string | undefined = head;
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = nodeMap.get(current);
    if (node) result.push(node);
    current = next.get(current);
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) result.push(n);
  }

  return result;
}
