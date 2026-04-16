/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3-snapshot differential analysis engine with BFS retainer chain extraction.
 *
 * Algorithm:
 *   Leak Candidates = { o ∈ S3 | o ∈ S2 ∧ o ∉ S1 }
 *
 * Objects that appear in both S2 and S3 but were NOT present in S1 are
 * considered suspect.  We then score, rank, and extract retainer chains.
 */

import type { HeapSnapshot } from './perfetto.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RetainerChainNode {
  nodeId: number;
  name: string;
  type: string;
  edgeType: string;
  edgeName: string;
}

export interface LeakCandidate {
  nodeId: number;
  constructorName: string;
  count: number;
  retainedSizeDelta: number;
  selfSize: number;
  retainerChain: RetainerChainNode[];
  confidence: 'high' | 'medium' | 'low';
}

export interface LeakReport {
  candidates: LeakCandidate[];
  totalLeakedBytes: number;
  snapshotSizes: [number, number, number];
  analysisTimestamp: number;
}

export interface DiffOptions {
  /** Maximum depth for BFS retainer chain (default: 5) */
  maxRetainerDepth?: number;
  /** Maximum number of candidates to return (default: 50) */
  maxCandidates?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SnapshotIndex {
  /** node id → flat array offset */
  nodeOffsets: Map<number, number>;
  nodeSize: number;
  typeIdx: number;
  nameIdx: number;
  idIdx: number;
  selfSizeIdx: number;
  edgeCountIdx: number;
  typeEnum: string[];
  edgeTypeIdx: number;
  edgeNameIdx: number;
  edgeToNodeIdx: number;
  edgeTypeEnum: string[];
}

function buildSnapshotIndex(snap: HeapSnapshot): SnapshotIndex {
  const nf = snap.snapshot.meta.node_fields;
  const ef = snap.snapshot.meta.edge_fields;
  const nodeSize = nf.length;

  const rawNodeTypeEnum = Array.isArray(snap.snapshot.meta.node_types[0])
    ? snap.snapshot.meta.node_types[0]
    : [];
  const typeEnum: string[] = rawNodeTypeEnum.filter(
    (x): x is string => typeof x === 'string',
  );
  const rawEdgeTypeEnum = Array.isArray(snap.snapshot.meta.edge_types[0])
    ? snap.snapshot.meta.edge_types[0]
    : [];
  const edgeTypeEnum: string[] = rawEdgeTypeEnum.filter(
    (x): x is string => typeof x === 'string',
  );

  const idIdx = nf.indexOf('id');
  const offsets = new Map<number, number>();

  for (let i = 0; i < snap.nodes.length; i += nodeSize) {
    const nodeId = idIdx >= 0 ? snap.nodes[i + idIdx] : i / nodeSize;
    offsets.set(nodeId, i);
  }

  return {
    nodeOffsets: offsets,
    nodeSize,
    typeIdx: nf.indexOf('type'),
    nameIdx: nf.indexOf('name'),
    idIdx,
    selfSizeIdx: nf.indexOf('self_size'),
    edgeCountIdx: nf.indexOf('edge_count'),
    typeEnum,
    edgeTypeIdx: ef.indexOf('type'),
    edgeNameIdx: ef.indexOf('name_or_index'),
    edgeToNodeIdx: ef.indexOf('to_node'),
    edgeTypeEnum,
  };
}

function getNodeField(
  snap: HeapSnapshot,
  idx: SnapshotIndex,
  offset: number,
  fieldIdx: number,
): number {
  return snap.nodes[offset + fieldIdx];
}

function getNodeName(
  snap: HeapSnapshot,
  idx: SnapshotIndex,
  offset: number,
): string {
  const nameIdx =
    idx.nameIdx >= 0 ? getNodeField(snap, idx, offset, idx.nameIdx) : 0;
  return snap.strings[nameIdx] ?? '';
}

function getNodeType(
  snap: HeapSnapshot,
  idx: SnapshotIndex,
  offset: number,
): string {
  const typeRaw =
    idx.typeIdx >= 0 ? getNodeField(snap, idx, offset, idx.typeIdx) : 0;
  return idx.typeEnum[typeRaw] ?? String(typeRaw);
}

function getNodeSelfSize(
  snap: HeapSnapshot,
  idx: SnapshotIndex,
  offset: number,
): number {
  return idx.selfSizeIdx >= 0
    ? getNodeField(snap, idx, offset, idx.selfSizeIdx)
    : 0;
}

/**
 * Build the edges list as a map from flat node offset → array of edge records.
 * Edges in the snapshot are stored after each node's edge_count edges.
 */
function buildEdgeMap(
  snap: HeapSnapshot,
  idx: SnapshotIndex,
): Map<
  number,
  Array<{ edgeType: string; edgeName: string; toOffset: number }>
> {
  const map = new Map<
    number,
    Array<{ edgeType: string; edgeName: string; toOffset: number }>
  >();
  const edgeSize = snap.snapshot.meta.edge_fields.length;
  let edgeOffset = 0;

  for (
    let nodeOffset = 0;
    nodeOffset < snap.nodes.length;
    nodeOffset += idx.nodeSize
  ) {
    const edgeCount =
      idx.edgeCountIdx >= 0 ? snap.nodes[nodeOffset + idx.edgeCountIdx] : 0;
    const edges: Array<{
      edgeType: string;
      edgeName: string;
      toOffset: number;
    }> = [];

    for (let e = 0; e < edgeCount; e++) {
      const base = edgeOffset + e * edgeSize;
      const typeRaw =
        idx.edgeTypeIdx >= 0 ? snap.edges[base + idx.edgeTypeIdx] : 0;
      const edgeType = idx.edgeTypeEnum[typeRaw] ?? String(typeRaw);
      const nameRaw =
        idx.edgeNameIdx >= 0 ? snap.edges[base + idx.edgeNameIdx] : 0;
      const edgeName = snap.strings[nameRaw] ?? String(nameRaw);
      const toOffset =
        idx.edgeToNodeIdx >= 0 ? snap.edges[base + idx.edgeToNodeIdx] : 0;
      edges.push({ edgeType, edgeName, toOffset });
    }

    map.set(nodeOffset, edges);
    edgeOffset += edgeCount * edgeSize;
  }

  return map;
}

// ---------------------------------------------------------------------------
// DiffEngine class
// ---------------------------------------------------------------------------

export class DiffEngine {
  /**
   * Build a reverse-edge map: toOffset → [fromOffset, …].
   * Used for BFS retainer chain extraction.
   */
  buildReverseEdgeMap(snap: HeapSnapshot): Map<number, number[]> {
    const idx = buildSnapshotIndex(snap);
    const edgeMap = buildEdgeMap(snap, idx);
    const reverse = new Map<number, number[]>();

    for (const [fromOffset, edges] of edgeMap) {
      for (const edge of edges) {
        const existing = reverse.get(edge.toOffset) ?? [];
        existing.push(fromOffset);
        reverse.set(edge.toOffset, existing);
      }
    }

    return reverse;
  }

  /**
   * BFS retainer chain: walk reverse edges from candidateNodeId to GC roots.
   * Returns chain ordered from candidate to root (or up to maxDepth).
   */
  buildRetainerChain(
    snap: HeapSnapshot,
    nodeId: number,
    maxDepth = 5,
  ): RetainerChainNode[] {
    const idx = buildSnapshotIndex(snap);
    const edgeMap = buildEdgeMap(snap, idx);
    const reverseEdges = this.buildReverseEdgeMap(snap);

    const startOffset = idx.nodeOffsets.get(nodeId);
    if (startOffset === undefined) return [];

    // BFS from startOffset
    const chain: RetainerChainNode[] = [];
    const visited = new Set<number>();
    const queue: Array<{
      offset: number;
      depth: number;
      edgeType: string;
      edgeName: string;
    }> = [{ offset: startOffset, depth: 0, edgeType: '', edgeName: '' }];

    while (queue.length > 0 && chain.length < maxDepth) {
      const item = queue.shift()!;
      if (visited.has(item.offset)) continue;
      visited.add(item.offset);

      const nName = getNodeName(snap, idx, item.offset);
      const nType = getNodeType(snap, idx, item.offset);
      const nId =
        idx.idIdx >= 0
          ? snap.nodes[item.offset + idx.idIdx]
          : item.offset / idx.nodeSize;

      chain.push({
        nodeId: nId,
        name: nName,
        type: nType,
        edgeType: item.edgeType,
        edgeName: item.edgeName,
      });

      if (item.depth >= maxDepth) continue;

      // Check if this is a root (no retainers)
      const retainers = reverseEdges.get(item.offset) ?? [];
      if (retainers.length === 0) break; // reached GC root

      for (const retainerOffset of retainers) {
        if (!visited.has(retainerOffset)) {
          // Find the edge from retainer to this node to get edge metadata
          const retainerEdges = edgeMap.get(retainerOffset) ?? [];
          const edge = retainerEdges.find((e) => e.toOffset === item.offset);
          queue.push({
            offset: retainerOffset,
            depth: item.depth + 1,
            edgeType: edge?.edgeType ?? '',
            edgeName: edge?.edgeName ?? '',
          });
        }
      }
    }

    return chain;
  }

  /**
   * Perform the 3-snapshot differential analysis.
   *
   * Leak Candidates = { o ∈ S3 | o ∈ S2 ∧ o ∉ S1 }
   */
  analyzeThreeSnapshots(
    s1: HeapSnapshot,
    s2: HeapSnapshot,
    s3: HeapSnapshot,
    options: DiffOptions = {},
  ): LeakReport {
    const maxRetainerDepth = options.maxRetainerDepth ?? 5;
    const maxCandidates = options.maxCandidates ?? 50;

    const idx1 = buildSnapshotIndex(s1);
    const idx2 = buildSnapshotIndex(s2);
    const idx3 = buildSnapshotIndex(s3);

    // Build ID sets
    const s1Ids = new Set(idx1.nodeOffsets.keys());
    const s2Ids = new Set(idx2.nodeOffsets.keys());
    const s3Ids = new Set(idx3.nodeOffsets.keys());

    // Candidates: in S3 AND S2, NOT in S1
    const candidateIds: number[] = [];
    for (const id of s3Ids) {
      if (s2Ids.has(id) && !s1Ids.has(id)) {
        candidateIds.push(id);
      }
    }

    // Group by constructor name (node name) and accumulate
    const groups = new Map<
      string,
      { ids: number[]; totalSelfSize: number; sizeInS2: number }
    >();

    for (const nodeId of candidateIds) {
      const off3 = idx3.nodeOffsets.get(nodeId)!;
      const name = getNodeName(s3, idx3, off3);
      const key = name || '(anonymous)';
      const selfSize3 = getNodeSelfSize(s3, idx3, off3);

      const off2 = idx2.nodeOffsets.get(nodeId);
      const selfSize2 =
        off2 !== undefined ? getNodeSelfSize(s2, idx2, off2) : 0;

      const existing = groups.get(key) ?? {
        ids: [],
        totalSelfSize: 0,
        sizeInS2: 0,
      };
      existing.ids.push(nodeId);
      existing.totalSelfSize += selfSize3;
      existing.sizeInS2 += selfSize2;
      groups.set(key, existing);
    }

    // Build candidates
    const rawCandidates: LeakCandidate[] = [];

    for (const [constructorName, info] of groups) {
      // Use the first id for retainer chain
      const representativeId = info.ids[0];
      const off3 = idx3.nodeOffsets.get(representativeId)!;
      const selfSize = getNodeSelfSize(s3, idx3, off3);
      const retainedSizeDelta = info.totalSelfSize - info.sizeInS2;

      // Confidence scoring:
      // high  – size growing (delta > 0) and multiple instances
      // medium – present in S2 and S3
      // low   – everything else
      let confidence: 'high' | 'medium' | 'low';
      if (retainedSizeDelta > 0 && info.ids.length > 1) {
        confidence = 'high';
      } else if (info.ids.length >= 1) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }

      const retainerChain = this.buildRetainerChain(
        s3,
        representativeId,
        maxRetainerDepth,
      );

      rawCandidates.push({
        nodeId: representativeId,
        constructorName,
        count: info.ids.length,
        retainedSizeDelta,
        selfSize,
        retainerChain,
        confidence,
      });
    }

    // Sort by retainedSizeDelta descending, take top N
    rawCandidates.sort((a, b) => b.retainedSizeDelta - a.retainedSizeDelta);
    const candidates = rawCandidates.slice(0, maxCandidates);

    const totalLeakedBytes = candidates.reduce(
      (sum, c) => sum + Math.max(0, c.retainedSizeDelta),
      0,
    );

    // Snapshot sizes = sum of all self_sizes
    const sizeOf = (snap: HeapSnapshot, idx: SnapshotIndex): number => {
      let total = 0;
      for (let i = 0; i < snap.nodes.length; i += idx.nodeSize) {
        total += idx.selfSizeIdx >= 0 ? snap.nodes[i + idx.selfSizeIdx] : 0;
      }
      return total;
    };

    return {
      candidates,
      totalLeakedBytes,
      snapshotSizes: [sizeOf(s1, idx1), sizeOf(s2, idx2), sizeOf(s3, idx3)],
      analysisTimestamp: Date.now(),
    };
  }
}
