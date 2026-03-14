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
  gapH?: number;
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

// Default gap between nodes (in characters)
const DEFAULT_GAP_H = 3;
const NODE_GAP_V_TD = 4; // Needs room for fork bar: stem + bar + drop + gap
const NODE_GAP_V_LR = 2; // Cross-axis gap for horizontal layouts

/**
 * Use dagre for topological ordering, then compact placement in char coords.
 */
export function layoutDiagram(
  nodes: LayoutInput[],
  edges: EdgeInput[],
  options: LayoutOptions,
): LayoutResult {
  const gapH = options.gapH ?? DEFAULT_GAP_H;
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
            x: Number((dn as Record<string, unknown>)['x']),
            y: Number((dn as Record<string, unknown>)['y']),
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
        cursorY += dims.height + NODE_GAP_V_LR;
        maxWidth = Math.max(maxWidth, dims.width);
      }
      cursorX += maxWidth + gapH;
    }
  } else {
    // TB / BT: place bottom-up so we can center parents over children

    // Build parent->children map from edges
    const childrenOf = new Map<string, string[]>();
    for (const edge of edges) {
      if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
      childrenOf.get(edge.source)!.push(edge.target);
    }

    // First pass: place leaf ranks (bottom-up) to compute widths
    // We process ranks in reverse so children are placed before parents
    const rankYPositions: number[] = [];
    let cursorY = 1;

    // Compute Y for each rank (top-down, we'll use this later)
    for (const rank of ranks) {
      let maxHeight = 0;
      for (const ni of rank) {
        const dims = computeNodeDimensions(ni.input.label);
        maxHeight = Math.max(maxHeight, dims.height);
      }
      rankYPositions.push(cursorY);
      cursorY += maxHeight + NODE_GAP_V_TD;
    }

    // Place ranks bottom-up: leaves first, then center parents
    for (let ri = ranks.length - 1; ri >= 0; ri--) {
      const rank = ranks[ri];
      const y = rankYPositions[ri];

      // Check if any node in this rank has children already placed
      const hasPlacedChildren = rank.some((ni) => {
        const kids = childrenOf.get(ni.input.id);
        return kids?.some((kid) => placedNodes.has(kid));
      });

      if (!hasPlacedChildren) {
        // Leaf rank: place left-to-right
        let cursorX = 1;
        for (const ni of rank) {
          const dims = computeNodeDimensions(ni.input.label);
          placedNodes.set(ni.input.id, {
            id: ni.input.id,
            label: ni.input.label,
            shape: ni.input.shape,
            x: cursorX,
            y,
            width: dims.width,
            height: dims.height,
          });
          cursorX += dims.width + gapH;
        }
      } else {
        // Parent rank: center each node over its children
        const rankNodes: DiagramNode[] = [];
        for (const ni of rank) {
          const dims = computeNodeDimensions(ni.input.label);
          const kids = childrenOf.get(ni.input.id);
          const placedKids = kids
            ?.map((kid) => placedNodes.get(kid))
            .filter((n): n is DiagramNode => n !== undefined);

          let nodeX: number;
          if (placedKids && placedKids.length > 0) {
            const minX = Math.min(...placedKids.map((k) => k.x));
            const maxChildRight = Math.max(
              ...placedKids.map((k) => k.x + k.width),
            );
            const centerX = Math.round((minX + maxChildRight) / 2);
            nodeX = Math.max(1, centerX - Math.floor(dims.width / 2));
          } else {
            nodeX = 1;
            for (const placed of placedNodes.values()) {
              if (placed.y === y) {
                nodeX = Math.max(nodeX, placed.x + placed.width + gapH);
              }
            }
          }

          rankNodes.push({
            id: ni.input.id,
            label: ni.input.label,
            shape: ni.input.shape,
            x: nodeX,
            y,
            width: dims.width,
            height: dims.height,
          });
        }

        // Fix overlaps: sort by x, shift right if overlapping
        rankNodes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < rankNodes.length; i++) {
          const prev = rankNodes[i - 1];
          const curr = rankNodes[i];
          const minX = prev.x + prev.width + gapH;
          if (curr.x < minX) {
            const shift = minX - curr.x;
            curr.x = minX;
            // Also shift all children of this node
            const kids = childrenOf.get(curr.id);
            if (kids) {
              const shiftSubtree = (nodeId: string, dx: number): void => {
                const placed = placedNodes.get(nodeId);
                if (placed) placed.x += dx;
                const subKids = childrenOf.get(nodeId);
                if (subKids) subKids.forEach((k) => shiftSubtree(k, dx));
              };
              kids.forEach((k) => shiftSubtree(k, shift));
            }
          }
        }

        for (const node of rankNodes) {
          placedNodes.set(node.id, node);
        }
      }
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
