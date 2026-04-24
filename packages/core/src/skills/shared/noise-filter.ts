/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 5-layer noise filter for heap snapshot nodes.
 * Removes non-actionable data before diff analysis and LLM processing.
 */

import type { HeapSnapshot } from './perfetto.js';

/** Minimal node representation used by the filter */
export interface FilterNode {
  nodeId: number;
  type: string;
  name: string;
  selfSize: number;
  edgeCount: number;
}

/** Context for combined filter application */
export interface FilterContext {
  /** Node IDs present in snapshot 1 (for temporal filtering) */
  s1Ids?: Set<number>;
  /** Node IDs present in snapshot 2 (for temporal filtering) */
  s2Ids?: Set<number>;
  /** Minimum self size threshold for layer 5 (default: 64) */
  sizeThreshold?: number;
}

// Layer 1: system/native object type names to skip
const SYSTEM_TYPES = new Set(['native', 'hidden', 'code', 'synthetic']);

// Layer 1: built-in constructor names that are never leaks
const BUILTIN_NAMES_RE =
  /^(Array|ArrayBuffer|Uint8Array|Float64Array|Map|Set|WeakMap|WeakSet|RegExp|Date|Math|JSON|parseInt|parseFloat|NaN|Infinity|undefined)$/;

// Layer 2: module cache patterns
const MODULE_CACHE_RE =
  /(Module\._cache|require\.cache|NativeModule|ContextifyScript)/;

// Layer 3: known singletons
const SINGLETON_RE =
  /(process\.|global\.|EventEmitter\.prototype|Stream\.prototype|Buffer\.poolSize)/;

/**
 * 5-layer noise filter that removes non-actionable heap snapshot nodes.
 *
 * Layer 1 – System/native objects
 * Layer 2 – Module cache entries
 * Layer 3 – Known singletons
 * Layer 4 – Short-lived objects (temporal: must survive to snapshot 2)
 * Layer 5 – Objects below a size threshold (default 64 bytes)
 */
export class NoiseFilter {
  /**
   * Layer 1: Skip system/native objects by type or well-known built-in name.
   * Returns true if the node should be FILTERED OUT (is noise).
   */
  layer1_systemObjects(node: FilterNode): boolean {
    if (SYSTEM_TYPES.has(node.type)) return true;
    if (BUILTIN_NAMES_RE.test(node.name)) return true;
    return false;
  }

  /**
   * Layer 2: Filter module cache entries.
   * Returns true if the node should be FILTERED OUT.
   */
  layer2_moduleCache(node: FilterNode): boolean {
    return MODULE_CACHE_RE.test(node.name);
  }

  /**
   * Layer 3: Filter known process/global singletons.
   * Returns true if the node should be FILTERED OUT.
   */
  layer3_singletons(node: FilterNode): boolean {
    return SINGLETON_RE.test(node.name);
  }

  /**
   * Layer 4: Temporal filter – keep only objects present in both S2 and S3.
   * Nodes only in S3 (not seen in S2) are likely short-lived, not leaks.
   * Returns true if the node should be FILTERED OUT.
   *
   * @param nodeId   The node's unique id
   * @param s2Ids    Set of node IDs present in snapshot 2
   * @param s3Ids    Set of node IDs present in snapshot 3 (current)
   */
  layer4_temporal(
    nodeId: number,
    s2Ids: Set<number>,
    s3Ids: Set<number>,
  ): boolean {
    // Keep only if present in both S2 and S3
    if (!s2Ids.has(nodeId)) return true; // not in S2 → short-lived
    if (!s3Ids.has(nodeId)) return true; // not in S3 → already GCed
    return false;
  }

  /**
   * Layer 5: Size threshold filter.
   * Returns true if the node should be FILTERED OUT.
   *
   * @param selfSize  Self size of the node in bytes
   * @param threshold Minimum size to keep (default 64)
   */
  layer5_sizeThreshold(selfSize: number, threshold = 64): boolean {
    return selfSize < threshold;
  }

  /**
   * Apply all 5 layers to a list of nodes.
   * Returns only the nodes that pass all active filters.
   *
   * @param nodes   Array of nodes to filter
   * @param context Optional context for temporal + size filtering
   */
  applyAll(nodes: FilterNode[], context: FilterContext = {}): FilterNode[] {
    const { s1Ids: _s1Ids, s2Ids, sizeThreshold = 64 } = context;
    // Build s3Ids from the provided nodes
    const s3Ids = new Set(nodes.map((n) => n.nodeId));

    return nodes.filter((node) => {
      // Layer 1
      if (this.layer1_systemObjects(node)) return false;
      // Layer 2
      if (this.layer2_moduleCache(node)) return false;
      // Layer 3
      if (this.layer3_singletons(node)) return false;
      // Layer 4 (only when s2Ids are provided)
      if (s2Ids !== undefined) {
        if (this.layer4_temporal(node.nodeId, s2Ids, s3Ids)) return false;
      }
      // Layer 5
      if (this.layer5_sizeThreshold(node.selfSize, sizeThreshold)) return false;
      return true;
    });
  }
}

/**
 * Extract FilterNode array from a HeapSnapshot using dynamic node_fields metadata.
 */
export function extractFilterNodes(snapshot: HeapSnapshot): FilterNode[] {
  const { node_fields, node_types } = snapshot.snapshot.meta;
  const nodeSize = node_fields.length;

  const typeIdx = node_fields.indexOf('type');
  const nameIdx = node_fields.indexOf('name');
  const idIdx = node_fields.indexOf('id');
  const selfSizeIdx = node_fields.indexOf('self_size');
  const edgeCountIdx = node_fields.indexOf('edge_count');

  const rawTypeEnum = Array.isArray(node_types[0]) ? node_types[0] : [];
  const typeEnum: string[] = rawTypeEnum.filter(
    (x): x is string => typeof x === 'string',
  );

  const nodes: FilterNode[] = [];

  for (let i = 0; i < snapshot.nodes.length; i += nodeSize) {
    const rawType = typeIdx >= 0 ? snapshot.nodes[i + typeIdx] : 0;
    const type = typeEnum[rawType] ?? String(rawType);
    const rawName = nameIdx >= 0 ? snapshot.nodes[i + nameIdx] : 0;
    const name = snapshot.strings[rawName] ?? '';
    const nodeId = idIdx >= 0 ? snapshot.nodes[i + idIdx] : i / nodeSize;
    const selfSize = selfSizeIdx >= 0 ? snapshot.nodes[i + selfSizeIdx] : 0;
    const edgeCount = edgeCountIdx >= 0 ? snapshot.nodes[i + edgeCountIdx] : 0;

    nodes.push({ nodeId, type, name, selfSize, edgeCount });
  }

  return nodes;
}

/**
 * Build a Set of all node IDs present in a snapshot (for temporal filtering).
 */
export function buildNodeIdSet(snapshot: HeapSnapshot): Set<number> {
  const { node_fields } = snapshot.snapshot.meta;
  const nodeSize = node_fields.length;
  const idIdx = node_fields.indexOf('id');
  const ids = new Set<number>();

  for (let i = 0; i < snapshot.nodes.length; i += nodeSize) {
    const nodeId = idIdx >= 0 ? snapshot.nodes[i + idIdx] : i / nodeSize;
    ids.add(nodeId);
  }

  return ids;
}
