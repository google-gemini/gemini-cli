/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import dagre from '@dagrejs/dagre';
import type { DiagramNode, DiagramEdge } from '../types.js';

interface LayoutInput {
  id: string;
  label: string;
  shape: DiagramNode['shape'];
}

interface EdgeInput {
  source: string;
  target: string;
  label?: string;
  style: DiagramEdge['style'];
}

interface LayoutOptions {
  direction: 'LR' | 'TD' | 'RL' | 'BT';
  terminalWidth: number;
}

interface LayoutResult {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  width: number;
  height: number;
}

/**
 * Compute node dimensions in character units.
 * width = label.length + 4 (padding) + 2 (border) = label.length + 6
 * height = 3 (border + content + border)
 */
export function computeNodeDimensions(label: string): {
  width: number;
  height: number;
} {
  return {
    width: label.length + 6,
    height: 3,
  };
}

// Gap between nodes (in characters)
const NODE_GAP_H = 3;
const NODE_GAP_V = 2;

/**
 * Use dagre for topological ordering, then compact placement in char coords.
 */
export function layoutDiagram(
  nodes: LayoutInput[],
  edges: EdgeInput[],
  options: LayoutOptions,
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  const rankdir = options.direction === 'TD' ? 'TB' : options.direction;
  const isHorizontal = rankdir === 'LR' || rankdir === 'RL';

  g.setGraph({ rankdir, nodesep: 1, ranksep: 1 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const dims = computeNodeDimensions(node.label);
    g.setNode(node.id, {
      label: node.label,
      width: dims.width,
      height: dims.height,
    });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, { label: edge.label ?? '' });
  }

  dagre.layout(g);

  // Group nodes by rank (dagre assigns y-rank for TB, x-rank for LR)
  interface NodeInfo {
    input: LayoutInput;
    dagreX: number;
    dagreY: number;
  }
  const nodeInfos: NodeInfo[] = nodes.map((n) => {
    const dn: unknown = g.node(n.id);
    const dnObj =
      typeof dn === 'object' && dn !== null && 'x' in dn && 'y' in dn
        ? {
            x: Number((dn as Record<string, unknown>).x),
            y: Number((dn as Record<string, unknown>).y),
          }
        : { x: 0, y: 0 };
    return { input: n, dagreX: dnObj.x, dagreY: dnObj.y };
  });

  // Helper to get rank/cross axis values
  const getRankVal = (ni: NodeInfo): number =>
    isHorizontal ? ni.dagreX : ni.dagreY;
  const getCrossVal = (ni: NodeInfo): number =>
    isHorizontal ? ni.dagreY : ni.dagreX;

  // Quantize ranks: nodes with similar rank values belong to the same rank
  const sorted = [...nodeInfos].sort((a, b) => getRankVal(a) - getRankVal(b));
  const ranks: Array<typeof nodeInfos> = [];
  let currentRank: typeof nodeInfos = [];
  let lastVal = -Infinity;

  for (const ni of sorted) {
    if (getRankVal(ni) - lastVal > 1) {
      if (currentRank.length > 0) ranks.push(currentRank);
      currentRank = [];
    }
    currentRank.push(ni);
    lastVal = getRankVal(ni);
  }
  if (currentRank.length > 0) ranks.push(currentRank);

  // Sort nodes within each rank by cross-axis position
  for (const rank of ranks) {
    rank.sort((a, b) => getCrossVal(a) - getCrossVal(b));
  }

  // Place nodes compactly in character coordinates
  const placedNodes: Map<string, DiagramNode> = new Map();

  if (isHorizontal) {
    let cursorX = 1;
    for (const rank of ranks) {
      let cursorY = 1;
      let maxWidth = 0;
      for (const ni of rank) {
        const dims = computeNodeDimensions(ni.input.label);
        placedNodes.set(ni.input.id, {
          id: ni.input.id,
          label: ni.input.label,
          shape: ni.input.shape,
          x: cursorX,
          y: cursorY,
          width: dims.width,
          height: dims.height,
        });
        cursorY += dims.height + NODE_GAP_V;
        maxWidth = Math.max(maxWidth, dims.width);
      }
      cursorX += maxWidth + NODE_GAP_H;
    }
  } else {
    // TB / BT
    let cursorY = 1;
    for (const rank of ranks) {
      let cursorX = 1;
      let maxHeight = 0;
      for (const ni of rank) {
        const dims = computeNodeDimensions(ni.input.label);
        placedNodes.set(ni.input.id, {
          id: ni.input.id,
          label: ni.input.label,
          shape: ni.input.shape,
          x: cursorX,
          y: cursorY,
          width: dims.width,
          height: dims.height,
        });
        cursorX += dims.width + NODE_GAP_H;
        maxHeight = Math.max(maxHeight, dims.height);
      }
      cursorY += maxHeight + NODE_GAP_V;
    }
  }

  const layoutNodes = nodes.map((n) => placedNodes.get(n.id)!);

  // Compute edges with endpoints at node borders
  const layoutEdges: DiagramEdge[] = edges.map((inputEdge) => {
    const srcNode = placedNodes.get(inputEdge.source)!;
    const tgtNode = placedNodes.get(inputEdge.target)!;

    const sCx = srcNode.x + Math.floor(srcNode.width / 2);
    const sCy = srcNode.y + Math.floor(srcNode.height / 2);
    const tCx = tgtNode.x + Math.floor(tgtNode.width / 2);
    const tCy = tgtNode.y + Math.floor(tgtNode.height / 2);

    let sourceX = sCx;
    let sourceY = sCy;
    let targetX = tCx;
    let targetY = tCy;

    if (isHorizontal) {
      // Exit right side of source, enter left side of target
      sourceX = srcNode.x + srcNode.width;
      targetX = tgtNode.x - 1;
    } else {
      // Exit below source box, enter above target box
      sourceY = srcNode.y + srcNode.height;
      targetY = tgtNode.y - 1;
    }

    const result: DiagramEdge = {
      source: inputEdge.source,
      target: inputEdge.target,
      style: inputEdge.style,
      sourceX,
      sourceY,
      targetX,
      targetY,
    };

    if (inputEdge.label) {
      result.label = inputEdge.label;
    }

    return result;
  });

  // Compute bounding box
  let maxX = 0;
  let maxY = 0;
  for (const n of layoutNodes) {
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxX + 1,
    height: maxY + 1,
  };
}
