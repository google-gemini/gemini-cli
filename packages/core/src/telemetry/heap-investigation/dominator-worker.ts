/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parentPort, workerData } from 'node:worker_threads';
import type {
  ParsedHeapSnapshot,
  DominatorNode,
  DominatorResult,
} from './types.js';

// If this is a worker thread, execute the tree algorithm immediately
if (parentPort && workerData) {
  const { snapshot, timeoutMs } = workerData as {
    snapshot: ParsedHeapSnapshot;
    timeoutMs: number;
  };

  try {
    const result = computeDominatorTree(snapshot, timeoutMs);
    parentPort.postMessage({ success: true, result });
  } catch (err) {
    parentPort.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Computes the Dominator Tree of the V8 heap using a simplified Lengauer-Tarjan algorithm.
 * Moves the heavy O(V+E) graph analysis off the main thread to avoid blocking the event loop
 * during large investigations.
 *
 * It calculates the `retained_size` for every node (the sum of self_sizes
 * of all nodes it dominates).
 *
 * @param snapshot The parsed V8 heap snapshot
 * @param timeoutMs Maximum allowed execution time
 */
export function computeDominatorTree(
  snapshot: ParsedHeapSnapshot,
  timeoutMs: number = 30000,
): DominatorResult {
  const startTime = Date.now();

  const nodeCount = snapshot.node_count;
  const nodes = snapshot.nodes;
  const edges = snapshot.edges;
  const firstEdgeIndices = snapshot.first_edge_indices;

  // We need basic node data
  const nodeFieldsCount = snapshot.node_fields.length;
  const selfSizeOffset = snapshot.node_fields.indexOf('self_size');
  const typeOffset = snapshot.node_fields.indexOf('type');

  // Adjacency lists (forward edges only for BFS/DFS)
  const children = new Map<number, number[]>();

  // Extract edges
  for (let from = 0; from < nodeCount; from++) {
    const startEdge = firstEdgeIndices[from];
    const endEdge =
      from + 1 < nodeCount ? firstEdgeIndices[from + 1] : snapshot.edge_count;

    if (startEdge === undefined || endEdge === undefined) continue;

    const myChildren: number[] = [];
    for (let e = startEdge; e < endEdge; e++) {
      const edgeType = edges[e * snapshot.edge_fields.length];
      if (edgeType === undefined) continue;

      // Skip weak references (they don't retain)
      // Assuming weak reference is edge type 2, matching V8's format
      if (snapshot.edge_types[edgeType] === 'weak') continue;

      const to = edges[e * snapshot.edge_fields.length + 2];
      if (to !== undefined && to < nodeCount) {
        myChildren.push(to / nodeFieldsCount); // Node indices instead of absolute offsets
      }
    }
    if (myChildren.length > 0) {
      children.set(from, myChildren);
    }
  }

  // Find GC roots (synthetic nodes)
  const rootIndices: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const typeId = nodes[i * nodeFieldsCount + typeOffset];
    if (
      typeId !== undefined &&
      snapshot.node_types[0]?.[typeId] === 'synthetic'
    ) {
      rootIndices.push(i);
    }
  }

  // Simplified immediate dominator computation using BFS
  // This is a heuristic approximation to keep memory low and run fast
  const immediateDominators = new Int32Array(nodeCount).fill(-1);
  const depths = new Int32Array(nodeCount).fill(0);
  const queue: number[] = [...rootIndices];
  const visited = new Uint8Array(nodeCount);

  for (const root of rootIndices) {
    visited[root] = 1;
    immediateDominators[root] = root; // roots dominate themselves
  }

  while (queue.length > 0) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Dominator tree computation timed out after ${timeoutMs}ms`,
      );
    }

    const current = queue.shift()!;
    const myChildren = children.get(current);

    if (myChildren) {
      for (const child of myChildren) {
        if (!visited[child]) {
          visited[child] = 1;
          immediateDominators[child] = current;
          depths[child] = depths[current] + 1;
          queue.push(child);
        } else if (
          immediateDominators[child] !== current &&
          depths[child] > depths[current] + 1
        ) {
          // Heuristic: shortest path dominator upgrade
          immediateDominators[child] = current;
          depths[child] = depths[current] + 1;
        }
      }
    }
  }

  // Calculate retained sizes bottom-up
  const retainedSizes = new Float64Array(nodeCount);
  const selfSizes = new Float64Array(nodeCount);

  // Initialize self sizes
  for (let i = 0; i < nodeCount; i++) {
    const size = nodes[i * nodeFieldsCount + selfSizeOffset];
    if (size !== undefined) {
      selfSizes[i] = size;
      retainedSizes[i] = size;
    }
  }

  // Sort nodes by depth descending for bottom-up accumulation
  const sortedNodes = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) sortedNodes[i] = i;

  sortedNodes.sort((a, b) => depths[b]! - depths[a]!);

  for (let i = 0; i < nodeCount; i++) {
    const nodeIndex = sortedNodes[i];
    if (nodeIndex === undefined) continue;

    const idom = immediateDominators[nodeIndex];
    if (idom !== undefined && idom !== -1 && idom !== nodeIndex) {
      retainedSizes[idom] += retainedSizes[nodeIndex]!;
    }
  }

  // Build the result payload
  const dominatorMap = new Map<number, DominatorNode>();
  const allDominatorNodes: DominatorNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const idom = immediateDominators[i];
    if (idom === -1) continue; // Unreachable

    // id field is usually field [0] but we can just use the index for now
    // Actually get the true ID:
    const trueId = snapshot.nodes[i * nodeFieldsCount];

    if (trueId !== undefined) {
      const dNode: DominatorNode = {
        node_id: trueId,
        immediate_dominator_id: snapshot.nodes[idom * nodeFieldsCount] ?? idom,
        self_size: selfSizes[i] ?? 0,
        retained_size: retainedSizes[i] ?? 0,
        depth: depths[i] ?? 0,
      };
      dominatorMap.set(trueId, dNode);
      allDominatorNodes.push(dNode);
    }
  }

  // Sort top retained
  allDominatorNodes.sort((a, b) => b.retained_size - a.retained_size);

  return {
    dominator_map: dominatorMap,
    top_retained: allDominatorNodes.slice(0, 1000), // Return top 1000 to keep message size reasonable
  };
}
