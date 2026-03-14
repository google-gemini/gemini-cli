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
function computeNodeDimensions(label: string): {
  width: number;
  height: number;
} {
  return {
    width: label.length + 6,
    height: 3,
  };
}

/**
 * Use dagre to compute a layout for the given nodes and edges.
 */
export function layoutDiagram(
  nodes: LayoutInput[],
  edges: EdgeInput[],
  options: LayoutOptions,
): LayoutResult {
  const g = new dagre.graphlib.Graph();

  // Map TD to TB for dagre (dagre uses TB, not TD)
  const rankdir = options.direction === 'TD' ? 'TB' : options.direction;

  g.setGraph({
    rankdir,
    nodesep: 4,
    ranksep: 3,
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes
  for (const node of nodes) {
    const dims = computeNodeDimensions(node.label);
    g.setNode(node.id, {
      label: node.label,
      width: dims.width,
      height: dims.height,
    });
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {
      label: edge.label ?? '',
    });
  }

  // Run layout
  dagre.layout(g);

  // Extract results
  const layoutNodes: DiagramNode[] = nodes.map((inputNode) => {
    const dagreNode = g.node(inputNode.id);
    const dims = computeNodeDimensions(inputNode.label);
    return {
      id: inputNode.id,
      label: inputNode.label,
      shape: inputNode.shape,
      x: Math.round(dagreNode.x - dims.width / 2),
      y: Math.round(dagreNode.y - dims.height / 2),
      width: dims.width,
      height: dims.height,
    };
  });

  const layoutEdges: DiagramEdge[] = edges.map((inputEdge) => {
    const dagreEdge = g.edge(inputEdge.source, inputEdge.target);
    const sourceNode = g.node(inputEdge.source);
    const targetNode = g.node(inputEdge.target);

    const result: DiagramEdge = {
      source: inputEdge.source,
      target: inputEdge.target,
      style: inputEdge.style,
      sourceX: Math.round(sourceNode.x),
      sourceY: Math.round(sourceNode.y),
      targetX: Math.round(targetNode.x),
      targetY: Math.round(targetNode.y),
    };

    if (inputEdge.label) {
      result.label = inputEdge.label;
    }

    if (dagreEdge.points) {
      result.points = dagreEdge.points.map((p: { x: number; y: number }) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
      }));
    }

    return result;
  });

  // Compute bounding box
  const graphInfo = g.graph();
  const width = Math.ceil(graphInfo.width ?? 0);
  const height = Math.ceil(graphInfo.height ?? 0);

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width,
    height,
  };
}
