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

interface TreeNode {
  id: string;
  label: string;
  left?: TreeNode;
  right?: TreeNode;
}

/**
 * Render a binary tree with proper centering and fork lines.
 *
 *           ┌──────┐
 *           │  15  │
 *           └──┬───┘
 *          ┌───┴───┐
 *       ┌──┴──┐ ┌──┴──┐
 *       │ 10  │ │ 20  │
 *       └─────┘ └─────┘
 */
export function renderBinaryTree(
  nodes: NodeInput[],
  edges: EdgeInput[],
): string[] {
  const root = buildTree(nodes, edges);
  if (!root) return ['(empty tree)'];

  const grid = renderNode(root);
  return grid.lines;
}

interface RenderResult {
  lines: string[];
  width: number;
  rootCenter: number; // x position of the root node's center
}

function renderNode(node: TreeNode): RenderResult {
  const boxWidth = node.label.length + 4;
  const box = makeBox(node.label, boxWidth);

  if (!node.left && !node.right) {
    // Leaf node
    return {
      lines: box,
      width: boxWidth,
      rootCenter: Math.floor(boxWidth / 2),
    };
  }

  // Render children
  const leftResult = node.left ? renderNode(node.left) : null;
  const rightResult = node.right ? renderNode(node.right) : null;

  if (leftResult && rightResult) {
    return combineTwoChildren(box, boxWidth, leftResult, rightResult);
  } else if (leftResult) {
    return combineOneChild(box, boxWidth, leftResult, 'left');
  } else {
    return combineOneChild(box, boxWidth, rightResult!, 'right');
  }
}

function combineTwoChildren(
  parentBox: string[],
  parentWidth: number,
  left: RenderResult,
  right: RenderResult,
): RenderResult {
  const gap = 3; // gap between left and right subtrees
  const childrenWidth = left.width + gap + right.width;
  const totalWidth = Math.max(parentWidth, childrenWidth);

  // Position children
  const leftOffset = Math.max(0, Math.floor((totalWidth - childrenWidth) / 2));
  const rightOffset = leftOffset + left.width + gap;

  // Position parent centered over children span
  const leftCenter = leftOffset + left.rootCenter;
  const rightCenter = rightOffset + right.rootCenter;
  const parentCenter = Math.floor((leftCenter + rightCenter) / 2);
  const parentOffset = Math.max(0, parentCenter - Math.floor(parentWidth / 2));

  const finalWidth = Math.max(
    totalWidth,
    parentOffset + parentWidth,
    rightOffset + right.width,
  );

  const lines: string[] = [];

  // Parent box
  for (const line of parentBox) {
    lines.push(padLine(line, parentOffset, finalWidth));
  }

  // Fork line: stem down from parent, horizontal bar, drops to children
  const stemX = parentOffset + Math.floor(parentWidth / 2);
  const forkLine = makeForkLine(stemX, leftCenter, rightCenter, finalWidth);
  lines.push(forkLine);

  // Drop lines to children
  const dropLine = makeDropLine(leftCenter, rightCenter, finalWidth);
  lines.push(dropLine);

  // Children lines (merge left and right side by side)
  const maxChildLines = Math.max(left.lines.length, right.lines.length);
  for (let i = 0; i < maxChildLines; i++) {
    const leftLine = i < left.lines.length ? left.lines[i] : '';
    const rightLine = i < right.lines.length ? right.lines[i] : '';

    let line = ' '.repeat(finalWidth);
    line = overlayAt(line, leftLine, leftOffset);
    line = overlayAt(line, rightLine, rightOffset);
    lines.push(line);
  }

  return {
    lines,
    width: finalWidth,
    rootCenter: parentOffset + Math.floor(parentWidth / 2),
  };
}

function combineOneChild(
  parentBox: string[],
  parentWidth: number,
  child: RenderResult,
  _side: 'left' | 'right',
): RenderResult {
  const totalWidth = Math.max(parentWidth, child.width);
  const childOffset = Math.floor((totalWidth - child.width) / 2);
  const parentOffset = Math.floor((totalWidth - parentWidth) / 2);
  const parentCenter = parentOffset + Math.floor(parentWidth / 2);

  const lines: string[] = [];

  for (const line of parentBox) {
    lines.push(padLine(line, parentOffset, totalWidth));
  }

  // Simple vertical line down to child
  const stemLine =
    ' '.repeat(parentCenter) + '│' + ' '.repeat(totalWidth - parentCenter - 1);
  lines.push(stemLine.slice(0, totalWidth));

  for (const line of child.lines) {
    lines.push(padLine(line, childOffset, totalWidth));
  }

  return {
    lines,
    width: totalWidth,
    rootCenter: parentCenter,
  };
}

function makeForkLine(
  stemX: number,
  leftX: number,
  rightX: number,
  width: number,
): string {
  const chars = ' '.repeat(width).split('');
  // Horizontal bar
  for (let x = leftX; x <= rightX; x++) {
    chars[x] = '─';
  }
  // Junctions
  chars[leftX] = '┌';
  chars[rightX] = '┐';
  if (stemX > leftX && stemX < rightX) {
    chars[stemX] = '┴';
  } else if (stemX === leftX) {
    chars[leftX] = '├';
  } else if (stemX === rightX) {
    chars[rightX] = '┤';
  }
  return chars.join('');
}

function makeDropLine(leftX: number, rightX: number, width: number): string {
  const chars = ' '.repeat(width).split('');
  chars[leftX] = '│';
  chars[rightX] = '│';
  return chars.join('');
}

function makeBox(label: string, width: number): string[] {
  const inner = width - 2;
  const padded = centerText(label, inner);
  return [
    '┌' + '─'.repeat(inner) + '┐',
    '│' + padded + '│',
    '└' + '─'.repeat(inner) + '┘',
  ];
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
}

function padLine(line: string, offset: number, totalWidth: number): string {
  const padded = ' '.repeat(offset) + line;
  if (padded.length < totalWidth) {
    return padded + ' '.repeat(totalWidth - padded.length);
  }
  return padded.slice(0, totalWidth);
}

function overlayAt(base: string, overlay: string, offset: number): string {
  const chars = base.split('');
  for (let i = 0; i < overlay.length && offset + i < chars.length; i++) {
    if (overlay[i] !== ' ') {
      chars[offset + i] = overlay[i];
    }
  }
  return chars.join('');
}

/**
 * Build a binary tree from flat nodes and edges.
 * Root = node with no incoming edges.
 * First child edge = left, second = right (mermaid declaration order).
 */
function buildTree(nodes: NodeInput[], edges: EdgeInput[]): TreeNode | null {
  if (nodes.length === 0) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Set<string>();
  const childrenOf = new Map<string, string[]>();

  for (const e of edges) {
    incoming.add(e.target);
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
  }

  // Find root
  let rootId = nodes[0].id;
  for (const n of nodes) {
    if (!incoming.has(n.id)) {
      rootId = n.id;
      break;
    }
  }

  function build(id: string): TreeNode | undefined {
    const node = nodeMap.get(id);
    if (!node) return undefined;
    const kids = childrenOf.get(id) ?? [];
    return {
      id: node.id,
      label: node.label,
      left: kids[0] ? build(kids[0]) : undefined,
      right: kids[1] ? build(kids[1]) : undefined,
    };
  }

  return build(rootId) ?? null;
}
