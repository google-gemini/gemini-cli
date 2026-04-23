/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * retainers.ts — Retainer Chain Walker for V8 Heap Snapshots
 *
 * Performs backward BFS from anomalous constructor instances through
 * the edge graph to identify why objects survive garbage collection.
 *
 * Uses dynamic field indexing from snapshot.meta.*_fields — never
 * hardcodes V8 offsets.
 *
 * Zero external dependencies. Requires Node.js >= 20.
 */

import path from 'node:path';
import type {
  HeapSnapshot,
  NodeIndex,
  RetainerChain,
  RetainerResult,
  RetainerStep,
  ReverseEdge,
  WalkRetainersOptions,
} from './types.js';

// ── Edge type priority for traversal ordering ──
const EDGE_PRIORITY: Record<string, number> = {
  context: 0,
  property: 1,
  element: 2,
  internal: 3,
  hidden: 4,
  shortcut: 5,
};

// ── Heuristic patterns for user-code names ──
const USER_CODE_PATTERNS: RegExp[] = [
  /^[A-Z][a-z]/, // PascalCase constructors
  /Handler$/,
  /Manager$/,
  /Service$/,
  /Context$/,
  /Controller$/,
  /Provider$/,
  /Factory$/,
  /Listener$/,
  /Callback$/,
];

/**
 * Build a node index from a raw V8 heap snapshot.
 */
export function buildNodeIndex(snapshot: HeapSnapshot): NodeIndex {
  const meta = snapshot.snapshot?.meta;
  if (!meta?.node_fields) {
    throw new Error('Invalid snapshot: missing snapshot.meta.node_fields');
  }
  if (!meta?.edge_fields) {
    throw new Error('Invalid snapshot: missing snapshot.meta.edge_fields');
  }
  if (!snapshot.nodes || !snapshot.strings) {
    throw new Error('Invalid snapshot: missing nodes or strings array');
  }

  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  const nodeStride = nodeFields.length;
  const edgeStride = edgeFields.length;

  // Dynamic node field offsets
  const typeOff = nodeFields.indexOf('type');
  const nameOff = nodeFields.indexOf('name');
  const idOff = nodeFields.indexOf('id');
  const selfSizeOff = nodeFields.indexOf('self_size');
  const edgeCountOff = nodeFields.indexOf('edge_count');

  if (nameOff === -1 || selfSizeOff === -1 || edgeCountOff === -1) {
    throw new Error('Invalid snapshot: missing required fields in node_fields (name, self_size, edge_count)');
  }

  // Dynamic edge field offsets
  const edgeTypeOff = edgeFields.indexOf('type');
  const edgeNameOrIndexOff = edgeFields.indexOf('name_or_index');
  const edgeToNodeOff = edgeFields.indexOf('to_node');

  if (edgeTypeOff === -1 || edgeToNodeOff === -1) {
    throw new Error('Invalid snapshot: missing required fields in edge_fields (type, to_node)');
  }

  // Resolve type name arrays
  const nodeTypes: string[] = Array.isArray(meta.node_types?.[0]) ? meta.node_types![0] as string[] : [];
  const edgeTypes: string[] = Array.isArray(meta.edge_types?.[0]) ? meta.edge_types![0] as string[] : [];

  const nodes = snapshot.nodes;
  const edges = snapshot.edges;
  const strings = snapshot.strings;
  const nodeCount = nodes.length / nodeStride;

  // Build per-node metadata: firstEdgeOffset
  const firstEdgeOffsets: number[] = new Array(nodeCount);
  let edgeCursor = 0;
  for (let i = 0; i < nodeCount; i++) {
    firstEdgeOffsets[i] = edgeCursor;
    const nodeOffset = i * nodeStride;
    edgeCursor += nodes[nodeOffset + edgeCountOff] * edgeStride;
  }

  return {
    nodeCount,
    nodeStride,
    edgeStride,
    typeOff,
    nameOff,
    idOff,
    selfSizeOff,
    edgeCountOff,
    edgeTypeOff,
    edgeNameOrIndexOff,
    edgeToNodeOff,
    nodeTypes,
    edgeTypes,
    nodes,
    edges: edges || [],
    strings,
    firstEdgeOffsets,
  };
}

/**
 * Resolve a human-readable name for a node at a given ordinal.
 */
function resolveNodeName(nodeIndex: NodeIndex, ordinal: number): string {
  const { nodes, strings, nodeStride, nameOff, typeOff, nodeTypes } = nodeIndex;
  const offset = ordinal * nodeStride;
  const name = strings[nodes[offset + nameOff]] || '';
  const typeId = typeOff !== -1 ? nodes[offset + typeOff] : -1;
  const typeName = typeId >= 0 && typeId < nodeTypes.length ? nodeTypes[typeId] : '';

  if (name) return name;
  if (typeName) return `(${typeName})`;
  return '(unknown)';
}

/**
 * Check if a node looks like a GC root or synthetic root.
 */
function isRootLike(nodeIndex: NodeIndex, ordinal: number): boolean {
  if (ordinal === 0) return true;

  const { nodes, nodeStride, typeOff, nodeTypes } = nodeIndex;
  if (typeOff === -1) return false;

  const typeId = nodes[ordinal * nodeStride + typeOff];
  const typeName = typeId >= 0 && typeId < nodeTypes.length ? nodeTypes[typeId] : '';

  return typeName === 'synthetic';
}

/**
 * Build a reverse edge map: for each target node ordinal, store
 * the list of edges that point TO it.
 */
export function buildReverseEdgeMap(
  snapshot: HeapSnapshot,
  nodeIndex: NodeIndex,
): Map<number, ReverseEdge[]> {
  const {
    nodeCount, nodeStride, edgeStride,
    edgeCountOff, edgeTypeOff, edgeNameOrIndexOff, edgeToNodeOff,
    edgeTypes, nodes, edges, strings, firstEdgeOffsets,
  } = nodeIndex;

  const reverseMap = new Map<number, ReverseEdge[]>();

  for (let fromOrdinal = 0; fromOrdinal < nodeCount; fromOrdinal++) {
    const nodeOffset = fromOrdinal * nodeStride;
    const edgeCount = nodes[nodeOffset + edgeCountOff];
    const firstEdge = firstEdgeOffsets[fromOrdinal];

    for (let e = 0; e < edgeCount; e++) {
      const edgeOffset = firstEdge + e * edgeStride;

      const edgeTypeId = edges[edgeOffset + edgeTypeOff];
      const edgeType = edgeTypeId >= 0 && edgeTypeId < edgeTypes.length
        ? edgeTypes[edgeTypeId] : 'unknown';

      // to_node is stored as a byte offset into the nodes array
      const toNodeByteOffset = edges[edgeOffset + edgeToNodeOff];
      const toOrdinal = toNodeByteOffset / nodeStride;

      // Resolve edge name
      let edgeName = '';
      if (edgeNameOrIndexOff !== -1) {
        const nameOrIndex = edges[edgeOffset + edgeNameOrIndexOff];
        if (edgeType === 'element' || edgeType === 'hidden') {
          edgeName = String(nameOrIndex);
        } else {
          edgeName = strings[nameOrIndex] || String(nameOrIndex);
        }
      }

      const entry: ReverseEdge = {
        fromOrdinal,
        toOrdinal,
        edgeType,
        edgeName,
      };

      if (!reverseMap.has(toOrdinal)) {
        reverseMap.set(toOrdinal, []);
      }
      reverseMap.get(toOrdinal)!.push(entry);
    }
  }

  return reverseMap;
}

/**
 * Find representative node ordinals for a set of constructor names.
 */
export function findRepresentativeNodes(
  snapshot: HeapSnapshot,
  constructorNames: string[],
  nodeIndex: NodeIndex,
  limitPerType: number = 3,
): Map<string, number[]> {
  const { nodeCount, nodeStride, nameOff, selfSizeOff, nodes, strings } = nodeIndex;
  const targetSet = new Set(constructorNames);
  const candidates = new Map<string, { ordinal: number; selfSize: number }[]>();

  for (let ordinal = 0; ordinal < nodeCount; ordinal++) {
    const offset = ordinal * nodeStride;
    const nameIndex = nodes[offset + nameOff];
    const name = strings[nameIndex] || '';

    if (!targetSet.has(name)) continue;

    const selfSize = nodes[offset + selfSizeOff];
    if (!candidates.has(name)) {
      candidates.set(name, []);
    }
    candidates.get(name)!.push({ ordinal, selfSize });
  }

  const result = new Map<string, number[]>();
  for (const [name, nodesList] of candidates) {
    // Sort by selfSize descending, take top limitPerType
    nodesList.sort((a, b) => b.selfSize - a.selfSize);
    result.set(name, nodesList.slice(0, limitPerType).map(n => n.ordinal));
  }

  return result;
}

/**
 * Score a retainer chain using a deterministic heuristic.
 */
function scoreChain(chain: RetainerStep[], reachesRoot: boolean): number {
  let score = 0;

  if (reachesRoot) score += 40;

  let contextCount = 0;
  let propertyCount = 0;
  let internalHiddenCount = 0;
  let userCodeNameCount = 0;

  for (const step of chain) {
    if (step.edgeType === 'context') contextCount++;
    if (step.edgeType === 'property') propertyCount++;
    if (step.edgeType === 'internal' || step.edgeType === 'hidden') internalHiddenCount++;
    if (USER_CODE_PATTERNS.some(p => p.test(step.from))) userCodeNameCount++;
    if (USER_CODE_PATTERNS.some(p => p.test(step.to))) userCodeNameCount++;
  }

  if (contextCount > 0) score += 20;
  if (propertyCount > 0) score += 15;
  if (userCodeNameCount > 0) score += 10;

  // Penalize if majority of edges are internal/hidden
  if (chain.length > 0 && internalHiddenCount / chain.length > 0.5) {
    score -= 20;
  }

  // Penalize extra hops beyond depth 3
  if (chain.length > 3) {
    score -= 10 * (chain.length - 3);
  }

  return score;
}

/** BFS queue entry for retainer chain walking. */
interface BfsEntry {
  ordinal: number;
  path: RetainerStep[];
  visited: Set<number>;
}

/**
 * Walk retainer chains for a set of anomaly constructor names.
 *
 * Performs backward BFS from representative instances of each
 * constructor, building reference paths from GC root to leaked object.
 */
export function walkRetainers(
  snapshot: HeapSnapshot,
  constructorNames: string[],
  options: WalkRetainersOptions = {},
): RetainerResult[] {
  const {
    maxDepth = 5,
    maxChainsPerType = 3,
    limitPerType = 3,
    skipWeakEdges = true,
  } = options;

  if (!constructorNames || constructorNames.length === 0) {
    return [];
  }

  const nodeIndex = buildNodeIndex(snapshot);
  const reverseMap = buildReverseEdgeMap(snapshot, nodeIndex);
  const representatives = findRepresentativeNodes(snapshot, constructorNames, nodeIndex, limitPerType);

  const results: RetainerResult[] = [];

  for (const constructorName of constructorNames) {
    const ordinals = representatives.get(constructorName);
    if (!ordinals || ordinals.length === 0) {
      results.push({
        anomaly: constructorName,
        chains: [],
      });
      continue;
    }

    const allChains: RetainerChain[] = [];

    for (const startOrdinal of ordinals) {
      const queue: BfsEntry[] = [{
        ordinal: startOrdinal,
        path: [],
        visited: new Set([startOrdinal]),
      }];

      // Safety bounds to prevent combinatorial explosion
      const MAX_QUEUE_SIZE = 10000;
      const MAX_BRANCHES_PER_NODE = 3;
      let iterations = 0;

      while (queue.length > 0) {
        if (iterations++ > MAX_QUEUE_SIZE || allChains.length >= maxChainsPerType * 3) break;

        const current = queue.shift()!;

        // Check if we reached a root
        if (current.path.length > 0 && isRootLike(nodeIndex, current.ordinal)) {
          const reachesRoot = true;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
          continue;
        }

        // Check depth limit
        if (current.path.length >= maxDepth) {
          const reachesRoot = false;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
          continue;
        }

        // Get reverse edges pointing to current node
        const reverseEdges = reverseMap.get(current.ordinal) || [];

        // Sort by edge type priority
        const sortedEdges = [...reverseEdges].sort((a, b) => {
          const pa = EDGE_PRIORITY[a.edgeType] ?? 99;
          const pb = EDGE_PRIORITY[b.edgeType] ?? 99;
          return pa - pb;
        });

        let expanded = false;
        let branchCount = 0;
        for (const edge of sortedEdges) {
          if (branchCount >= MAX_BRANCHES_PER_NODE) break;

          // Skip weak edges if configured
          if (skipWeakEdges && edge.edgeType === 'weak') continue;

          // Skip cycles within this path
          if (current.visited.has(edge.fromOrdinal)) continue;

          const fromName = resolveNodeName(nodeIndex, edge.fromOrdinal);
          const toName = resolveNodeName(nodeIndex, current.ordinal);

          const step: RetainerStep = {
            from: fromName,
            edgeType: edge.edgeType,
            edgeName: edge.edgeName,
            to: toName,
          };

          const newVisited = new Set(current.visited);
          newVisited.add(edge.fromOrdinal);

          queue.push({
            ordinal: edge.fromOrdinal,
            path: [...current.path, step],
            visited: newVisited,
          });
          expanded = true;
          branchCount++;
        }

        // If no expansion happened and we have a partial path, record it
        if (!expanded && current.path.length > 0) {
          const reachesRoot = false;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
        }
      }
    }

    // Sort chains by score descending, take top maxChainsPerType
    allChains.sort((a, b) => b.score - a.score);

    results.push({
      anomaly: constructorName,
      chains: allChains.slice(0, maxChainsPerType),
    });
  }

  return results;
}

// ── CLI entry point ──
const scriptPath = process.argv[1];
const modulePath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
if (scriptPath && path.resolve(scriptPath) === path.resolve(modulePath)) {
  console.log('retainers.ts — Retainer Chain Walker');
  console.log('This module is designed to be imported, not run directly.');
  console.log('');
  console.log('Exports:');
  console.log('  buildNodeIndex(snapshot)');
  console.log('  buildReverseEdgeMap(snapshot, nodeIndex)');
  console.log('  findRepresentativeNodes(snapshot, constructors, nodeIndex, limit)');
  console.log('  walkRetainers(snapshot, constructors, options)');
}
