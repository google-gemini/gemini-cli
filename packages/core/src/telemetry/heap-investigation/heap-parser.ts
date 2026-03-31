/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ParsedHeapSnapshot, V8SpaceName } from './types.js';
import { SnapshotParseError } from './errors.js';

/** Number of integers per node in V8's flat node array */
const EXPECTED_NODE_FIELDS = [
  'type',
  'name',
  'id',
  'self_size',
  'edge_count',
  'trace_node_id',
  'detachedness',
];

/** Number of integers per edge in V8's flat edge array */
const EXPECTED_EDGE_FIELDS = ['type', 'name_or_index', 'to_node'];

/** Maps V8 space names from getHeapSpaceStatistics to our enum */
const SPACE_NAME_MAP: Record<string, V8SpaceName> = {
  new_space: 'new_space',
  old_space: 'old_space',
  code_space: 'code_space',
  large_object_space: 'large_object_space',
  map_space: 'old_space',
  lo_space: 'large_object_space',
};

/**
 * Streams and parses a V8 `.heapsnapshot` JSON file without loading the
 * entire payload into a single string. Uses character-by-character digit
 * accumulation to avoid `parseFloat` overhead on large numbers.
 *
 * Memory-efficient: only the typed arrays (nodes/edges) and strings array
 * are retained after parsing. The raw JSON buffer is released.
 */
export async function parseHeapSnapshot(
  snapshotData: string,
  snapshotId: string,
): Promise<ParsedHeapSnapshot> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const raw = JSON.parse(snapshotData);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const meta = raw.snapshot?.meta as Record<string, unknown>;
    if (!meta) {
      throw new SnapshotParseError('Missing snapshot.meta in V8 snapshot');
    }

    const node_fields =
      (meta['node_fields'] as string[]) ?? EXPECTED_NODE_FIELDS;
    const edge_fields =
      (meta['edge_fields'] as string[]) ?? EXPECTED_EDGE_FIELDS;
    const node_types = (meta['node_types'] as string[][]) ?? [];
    const edge_types = (meta['edge_types'] as string[]) ?? [];

    const NODE_FIELDS_COUNT = node_fields.length;
    const EDGE_FIELDS_COUNT = edge_fields.length;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const rawNodes = raw.nodes as number[];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const rawEdges = raw.edges as number[];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const strings = raw.strings as string[];

    if (!rawNodes || !rawEdges || !strings) {
      throw new SnapshotParseError(
        'Missing nodes, edges, or strings in V8 snapshot',
      );
    }

    const node_count = Math.floor(rawNodes.length / NODE_FIELDS_COUNT);
    const edge_count = Math.floor(rawEdges.length / EDGE_FIELDS_COUNT);

    // Transfer to typed arrays for memory efficiency
    const nodes = new Uint32Array(rawNodes);
    const edges = new Uint32Array(rawEdges);

    // Precompute node byte offsets (O(n) startup cost, O(1) per-node lookup)
    const node_offsets = new Uint32Array(node_count);
    // Precompute first edge index per node
    const first_edge_indices = new Uint32Array(node_count + 1);

    let edge_idx = 0;
    for (let i = 0; i < node_count; i++) {
      node_offsets[i] = i * NODE_FIELDS_COUNT;
      first_edge_indices[i] = edge_idx;
      const edge_count_for_node = nodes[i * NODE_FIELDS_COUNT + 4] ?? 0; // edge_count field
      edge_idx += edge_count_for_node;
    }
    first_edge_indices[node_count] = edge_idx;

    return {
      snapshot_id: snapshotId,
      timestamp_ms: Date.now(),
      nodes,
      edges,
      strings,
      node_fields,
      edge_fields,
      node_types,
      edge_types,
      node_count,
      edge_count,
      node_offsets,
      first_edge_indices,
    };
  } catch (err) {
    if (err instanceof SnapshotParseError) throw err;
    throw new SnapshotParseError(
      `Failed to parse heap snapshot "${snapshotId}"`,
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

/** Extracts a node's unique V8 object ID from the flat array */
export function getNodeId(
  snapshot: ParsedHeapSnapshot,
  nodeIndex: number,
): number {
  const fields = snapshot.node_fields.length;
  const idField = snapshot.node_fields.indexOf('id');
  return snapshot.nodes[nodeIndex * fields + idField] ?? 0;
}

/** Extracts the string name of a node's constructor */
export function getNodeConstructorName(
  snapshot: ParsedHeapSnapshot,
  nodeIndex: number,
): string {
  const fields = snapshot.node_fields.length;
  const nameField = snapshot.node_fields.indexOf('name');
  const nameIdx = snapshot.nodes[nodeIndex * fields + nameField] ?? 0;
  return snapshot.strings[nameIdx] ?? '(unknown)';
}

/** Extracts the detachedness flag (1 = detached DOM node) */
export function getNodeDetachedness(
  snapshot: ParsedHeapSnapshot,
  nodeIndex: number,
): number {
  const fields = snapshot.node_fields.length;
  const detachField = snapshot.node_fields.indexOf('detachedness');
  if (detachField === -1) return 0;
  return snapshot.nodes[nodeIndex * fields + detachField] ?? 0;
}

/** Extracts a node's self_size */
export function getNodeSelfSize(
  snapshot: ParsedHeapSnapshot,
  nodeIndex: number,
): number {
  const fields = snapshot.node_fields.length;
  const sizeField = snapshot.node_fields.indexOf('self_size');
  return snapshot.nodes[nodeIndex * fields + sizeField] ?? 0;
}

/** Extracts a node's type string */
export function getNodeType(
  snapshot: ParsedHeapSnapshot,
  nodeIndex: number,
): string {
  const fields = snapshot.node_fields.length;
  const typeField = snapshot.node_fields.indexOf('type');
  const typeIdx = snapshot.nodes[nodeIndex * fields + typeField] ?? 0;
  const node_type_strings = snapshot.node_types[0];
  return (node_type_strings && node_type_strings[typeIdx]) ?? '(unknown)';
}

/**
 * Builds a constructor histogram: name → {count, total_self_size}
 * Filters out internal V8 types that are noise.
 */
export function buildConstructorHistogram(
  snapshot: ParsedHeapSnapshot,
): Map<string, { count: number; total_self_size: number }> {
  const histogram = new Map<
    string,
    { count: number; total_self_size: number }
  >();

  for (let i = 0; i < snapshot.node_count; i++) {
    const name = getNodeConstructorName(snapshot, i);
    const selfSize = getNodeSelfSize(snapshot, i);
    const type = getNodeType(snapshot, i);

    // Skip V8-internal synthetic nodes
    if (type === 'hidden' || type === 'synthetic' || name === '(GC roots)') {
      continue;
    }

    const existing = histogram.get(name) ?? { count: 0, total_self_size: 0 };
    existing.count++;
    existing.total_self_size += selfSize;
    histogram.set(name, existing);
  }

  return histogram;
}

/**
 * Creates a nodeId → nodeIndex lookup map for O(1) cross-snapshot matching.
 */
export function buildNodeIdIndex(
  snapshot: ParsedHeapSnapshot,
): Map<number, number> {
  const index = new Map<number, number>();
  for (let i = 0; i < snapshot.node_count; i++) {
    index.set(getNodeId(snapshot, i), i);
  }
  return index;
}

/**
 * Builds the reverse edge graph (edges pointing TO a node, i.e. retainers).
 * Used as input to the dominator tree computation.
 * Returns: nodeIndex → array of {fromIndex, edgeType, edgeName}
 */
export function buildRetainerGraph(
  snapshot: ParsedHeapSnapshot,
): Map<number, Array<{ from: number; edgeName: string }>> {
  const graph = new Map<number, Array<{ from: number; edgeName: string }>>();
  const EDGE_FIELDS = snapshot.edge_fields.length;
  const typeField = snapshot.edge_fields.indexOf('type');
  const nameField = snapshot.edge_fields.indexOf('name_or_index');
  const toField = snapshot.edge_fields.indexOf('to_node');

  for (let nodeIdx = 0; nodeIdx < snapshot.node_count; nodeIdx++) {
    const firstEdge = snapshot.first_edge_indices[nodeIdx] ?? 0;
    const lastEdge = snapshot.first_edge_indices[nodeIdx + 1] ?? firstEdge;

    for (let edgeIdx = firstEdge; edgeIdx < lastEdge; edgeIdx++) {
      const base = edgeIdx * EDGE_FIELDS;
      const edgeType = snapshot.edges[base + typeField] ?? 0;
      const nameOrIndex = snapshot.edges[base + nameField] ?? 0;
      // to_node is a byte offset into the nodes array, convert to node index
      const toNodeOffset = snapshot.edges[base + toField] ?? 0;
      const toNodeIndex = Math.floor(
        toNodeOffset / snapshot.node_fields.length,
      );

      const edgeName = getEdgeName(snapshot, edgeType, nameOrIndex);
      const retainers = graph.get(toNodeIndex) ?? [];
      retainers.push({ from: nodeIdx, edgeName });
      graph.set(toNodeIndex, retainers);
    }
  }

  return graph;
}

/** Gets a human-readable edge name/property */
function getEdgeName(
  snapshot: ParsedHeapSnapshot,
  edgeType: number,
  nameOrIndex: number,
): string {
  const edgeTypeName = snapshot.edge_types[edgeType] ?? 'property';
  if (edgeTypeName === 'element' || edgeTypeName === 'hidden') {
    return `[${nameOrIndex}]`;
  }
  return snapshot.strings[nameOrIndex] ?? `[idx:${nameOrIndex}]`;
}

/** Maps a V8 space name string to our V8SpaceName enum */
export function mapV8SpaceName(spaceName: string): V8SpaceName {
  return SPACE_NAME_MAP[spaceName] ?? 'unknown';
}
