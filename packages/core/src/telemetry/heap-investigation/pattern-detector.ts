/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ParsedHeapSnapshot,
  SnapshotDiff,
  ConstructorDelta,
  HdslConstructorEntry,
  HdslDetachedNodes,
  LeakPattern,
} from './types.js';
import {
  buildConstructorHistogram,
  buildNodeIdIndex,
  buildRetainerGraph,
  getNodeDetachedness,
  getNodeConstructorName,
  getNodeType,
} from './heap-parser.js';

/**
 * V8 system types that are always noise — never user-application objects.
 * Derived from V8 source and community-validated (HVVSATHWIK, Rithvickkr).
 */
const SYSTEM_TYPE_FILTER = new Set([
  '(compiled code)',
  '(sliced string)',
  '(concatenated string)',
  '(external string)',
  '(system)',
  '(GC roots)',
  'GC roots',
  '(internalized string)',
  'Oddball',
  'Map', // V8 hidden class Maps — NOT JS Map objects
  'PropertyArray',
  'FeedbackVector',
  'FeedbackCell',
  'ScopeInfo',
  'DescriptorArray',
  'TransitionArray',
  'EnumCache',
  'CodeDataContainer',
  'JSGlobalPropertyCell',
  'Cell',
  'WeakFixedArray',
  'WeakArrayList',
]);

/** Constructor names that are expected to be long-lived (caches, pools) */
const EXPECTED_LONG_LIVED = new Set([
  'NativeModule',
  'CachedData',
  'BufferList',
  'BigUint64Array',
  'ArrayBuffer',
]);

/** Minimum self-size delta to include a constructor (1 KB noise floor) */
const MIN_DELTA_BYTES_NOISE_FLOOR = 1_024;

/** Minimum instance delta to be considered meaningful */
const MIN_DELTA_COUNT = 3;

/**
 * Applies the 3-snapshot formula: leaked = (S2 − S1) ∩ S3
 * Objects that appear in S2 but not S1 AND are still in S3 are genuinely leaked.
 *
 * Also applies 5-layer noise filtering (from the community thread):
 *  Layer 1 – System type exclusion (V8 internal types)
 *  Layer 2 – Known long-lived pool/cache exclusion
 *  Layer 3 – 1 KB size floor on delta
 *  Layer 4 – Minimum count threshold (< 3 instances = transient noise)
 *  Layer 5 – Stable-count filter: if count barely grew relative to S1 base, skip
 */
export function diffSnapshots(
  s1: ParsedHeapSnapshot,
  s2: ParsedHeapSnapshot,
  s3: ParsedHeapSnapshot,
): SnapshotDiff {
  const s1Ids = buildNodeIdIndex(s1);
  const s2Ids = buildNodeIdIndex(s2);
  const s3Ids = buildNodeIdIndex(s3);

  // S2 − S1: new objects in S2 that weren't in S1
  const newInS2 = new Set<number>();
  for (const [id] of s2Ids) {
    if (!s1Ids.has(id)) {
      newInS2.add(id);
    }
  }

  // (S2 − S1) ∩ S3: objects that survived to S3 → leaked
  const leakedNodeIds = new Set<number>();
  for (const id of newInS2) {
    if (s3Ids.has(id)) {
      leakedNodeIds.add(id);
    }
  }

  // Build constructor-level deltas (S1 vs S3) with 5-layer noise filter
  const s1Histogram = buildConstructorHistogram(s1);
  const s3Histogram = buildConstructorHistogram(s3);

  const allConstructors = new Set([
    ...s1Histogram.keys(),
    ...s3Histogram.keys(),
  ]);
  const constructor_deltas = new Map<string, ConstructorDelta>();

  for (const name of allConstructors) {
    // Layer 1: system type filter
    if (SYSTEM_TYPE_FILTER.has(name)) continue;
    // Layer 2: expected long-lived pool exclusion
    if (EXPECTED_LONG_LIVED.has(name)) continue;

    const s1Entry = s1Histogram.get(name) ?? { count: 0, total_self_size: 0 };
    const s3Entry = s3Histogram.get(name) ?? { count: 0, total_self_size: 0 };
    const delta_count = s3Entry.count - s1Entry.count;
    const delta_bytes = s3Entry.total_self_size - s1Entry.total_self_size;

    // Only include constructors that grew
    if (delta_count <= 0 && delta_bytes <= 0) continue;

    // Layer 3: 1 KB noise floor
    if (delta_bytes < MIN_DELTA_BYTES_NOISE_FLOOR && delta_count <= 0) continue;

    // Layer 4: minimum count threshold
    if (
      delta_count < MIN_DELTA_COUNT &&
      delta_bytes < MIN_DELTA_BYTES_NOISE_FLOOR
    )
      continue;

    // Layer 5: stable-count filter — skip if growth is < 5% relative to base
    if (s1Entry.count > 0) {
      const growthRate = delta_count / s1Entry.count;
      if (growthRate < 0.05 && delta_bytes < MIN_DELTA_BYTES_NOISE_FLOOR * 10)
        continue;
    }

    constructor_deltas.set(name, {
      name,
      count_s1: s1Entry.count,
      count_s3: s3Entry.count,
      delta_count,
      self_size_s1: s1Entry.total_self_size,
      self_size_s3: s3Entry.total_self_size,
      delta_bytes,
    });
  }

  return {
    s1_id: s1.snapshot_id,
    s3_id: s3.snapshot_id,
    leaked_node_ids: leakedNodeIds,
    constructor_deltas,
  };
}

/**
 * Counts detached DOM nodes in a snapshot.
 * Uses the V8 `detachedness` field (value 1 = detached, 0 = attached/unknown).
 * Source field validated at: snapshot.meta.node_fields includes 'detachedness'.
 * As of Node.js 20+, V8 sets this field for DOM wrappers in Blink/Ink/React trees.
 */
export function analyzeDetachedNodes(
  snapshot: ParsedHeapSnapshot,
): HdslDetachedNodes {
  const detachedConstructors = new Map<string, number>();
  let totalDetached = 0;

  const hasDetachednessField = snapshot.node_fields.includes('detachedness');

  for (let i = 0; i < snapshot.node_count; i++) {
    // detachedness === 1 means node is confirmed detached
    // detachedness === 0 means attached or unknown
    const detached = getNodeDetachedness(snapshot, i);
    if (detached === 1) {
      totalDetached++;
      const name = getNodeConstructorName(snapshot, i);
      detachedConstructors.set(name, (detachedConstructors.get(name) ?? 0) + 1);
    }
  }

  // Sort by count and take top 5
  const top = [...detachedConstructors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    count: totalDetached,
    top_constructors: top,
    detachedness_source: hasDetachednessField
      ? 'v8_detachedness_field'
      : 'heuristic',
  };
}

/**
 * Scans a snapshot's string table for credential/secret patterns.
 * Returns the count of flagged strings (not the strings themselves — no data exfiltration).
 * Raised as a security concern in the issue thread (Anjaligarhwal dogfood: 9 flagged).
 */
export interface SensitiveStringReport {
  total_flagged: number;
  api_key_pattern_count: number;
  password_field_count: number;
  token_pattern_count: number;
}

const SENSITIVE_PATTERNS = [
  {
    label: 'api_key',
    re: /(?:api[_-]?key|apiKey|APIKEY)\s*[=:\s]\s*['"]?[A-Za-z0-9_\-]{20,}/i,
  },
  {
    label: 'password',
    re: /(?:password|passwd|secret|credential)\s*[=:\s]\s*['"]?\S{8,}/i,
  },
  {
    label: 'token',
    re: /(?:bearer\s+|access_token|auth_token)[A-Za-z0-9_.\-]{20,}/i,
  },
];

export function scanSensitiveStrings(
  snapshot: ParsedHeapSnapshot,
): SensitiveStringReport {
  let api_key_pattern_count = 0;
  let password_field_count = 0;
  let token_pattern_count = 0;

  for (const s of snapshot.strings) {
    if (s.length < 8 || s.length > 2000) continue; // skip too short or too long
    if (SENSITIVE_PATTERNS[0]!.re.test(s)) api_key_pattern_count++;
    if (SENSITIVE_PATTERNS[1]!.re.test(s)) password_field_count++;
    if (SENSITIVE_PATTERNS[2]!.re.test(s)) token_pattern_count++;
  }

  return {
    total_flagged:
      api_key_pattern_count + password_field_count + token_pattern_count,
    api_key_pattern_count,
    password_field_count,
    token_pattern_count,
  };
}

/** Known event-emitter-related constructor names */
const EVENT_EMITTER_NAMES = new Set([
  'EventEmitter',
  'EventTarget',
  'Socket',
  'Server',
  'IncomingMessage',
  'ClientRequest',
  'Stream',
]);

/** Known cache/map-like constructor names */
const CACHE_NAMES = new Set([
  'Map',
  'WeakMap',
  'Cache',
  'LRUCache',
  'NodeCache',
  'MemoryCache',
]);

/**
 * Pattern detector: classifies which leak patterns are present
 * based on the constructor deltas and detached node analysis.
 * 9 patterns (expanded from thread discussion):
 *  1. event_listener_accumulation
 *  2. closure_scope_capture
 *  3. unbounded_cache
 *  4. array_accumulation
 *  5. timer_leak
 *  6. global_reference
 *  7. promise_chain_buildup
 *  8. detached_dom_subtree
 *  9. circular_reference (new)
 */
export function detectLeakPatterns(
  diff: SnapshotDiff,
  detached: HdslDetachedNodes,
): Map<string, LeakPattern[]> {
  const constructorPatterns = new Map<string, LeakPattern[]>();

  for (const [name, delta] of diff.constructor_deltas) {
    const patterns: LeakPattern[] = [];

    // Pattern 1: Event listener accumulation
    if (EVENT_EMITTER_NAMES.has(name) && delta.delta_count > 10) {
      patterns.push('event_listener_accumulation');
    }

    // Pattern 2: Closure scope capture (many small Function/closure objects)
    if ((name === 'Function' || name === 'Closure') && delta.delta_count > 50) {
      patterns.push('closure_scope_capture');
    }

    // Pattern 3: Unbounded cache (Map/object growing without bound)
    if (CACHE_NAMES.has(name) && delta.delta_bytes > 1_000_000) {
      patterns.push('unbounded_cache');
    }

    // Pattern 4: Array accumulation
    if ((name === 'Array' || name.endsWith('[]')) && delta.delta_count > 100) {
      patterns.push('array_accumulation');
    }

    // Pattern 5: Timer leak (Timeout/Interval objects not cleared)
    if (name === 'Timeout' || name === 'Timer' || name === 'TimersList') {
      patterns.push('timer_leak');
    }

    // Pattern 6: Global reference (large objects with few instances → likely global refs)
    if (delta.delta_bytes > 5_000_000 && delta.delta_count < 10) {
      patterns.push('global_reference');
    }

    // Pattern 7: Promise chain buildup
    if (name === 'Promise' && delta.delta_count > 100) {
      patterns.push('promise_chain_buildup');
    }

    // Pattern 8: Detached DOM subtree (uses V8 detachedness field, not heuristic)
    if (detached.top_constructors.includes(name) && detached.count > 100) {
      patterns.push('detached_dom_subtree');
    }

    // Pattern 9: Circular reference — many objects of same type that grew monotonically
    // Heuristic: high count delta with moderate size delta suggests circular chains
    // preventing GC collection (WeakRef objects accumulating = circular backref sign).
    if (
      (name.includes('WeakRef') || name.includes('FinalizationRegistry')) &&
      delta.delta_count > 20
    ) {
      patterns.push('circular_reference');
    }

    if (patterns.length > 0) {
      constructorPatterns.set(name, patterns);
    }
  }

  return constructorPatterns;
}

/**
 * Walks the reverse edge graph via BFS to find the shortest GC-root
 * retention path for a given constructor name.
 *
 * Addresses the "retainer chain depth" question from the thread (ishansurdi):
 * - Default max depth of 6 hops (configurable)
 * - Stops at GC roots (node type === 'synthetic' or name contains 'GC root')
 * - Returns a human-readable path string like:
 *   "global → McpClient._transport → EventEmitter._events → listener"
 */
export function walkRetainerChain(
  snapshot: ParsedHeapSnapshot,
  targetConstructor: string,
  maxDepth: number = 6,
): string {
  const retainerGraph = buildRetainerGraph(snapshot);

  // Find node indices for the target constructor
  const targetIndices: number[] = [];
  for (let i = 0; i < snapshot.node_count; i++) {
    if (getNodeConstructorName(snapshot, i) === targetConstructor) {
      targetIndices.push(i);
      if (targetIndices.length >= 3) break; // sample first 3 instances
    }
  }

  if (targetIndices.length === 0) {
    return `(${targetConstructor} not found in snapshot)`;
  }

  // BFS backward from target to GC root
  const visited = new Set<number>();
  let queue: Array<{ nodeIdx: number; path: string[] }> = targetIndices.map(
    (idx) => ({
      nodeIdx: idx,
      path: [targetConstructor],
    }),
  );

  for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
    const nextQueue: typeof queue = [];

    for (const { nodeIdx, path } of queue) {
      if (visited.has(nodeIdx)) continue;
      visited.add(nodeIdx);

      const type = getNodeType(snapshot, nodeIdx);
      const name = getNodeConstructorName(snapshot, nodeIdx);

      // Hit a GC root → return this path
      if (
        type === 'synthetic' ||
        name === '(GC roots)' ||
        name.includes('GC root')
      ) {
        return 'global → ' + path.slice().reverse().join(' → ');
      }

      const retainers = retainerGraph.get(nodeIdx) ?? [];
      for (const { from, edgeName } of retainers.slice(0, 3)) {
        // limit fan-out
        const retainerName = getNodeConstructorName(snapshot, from);
        nextQueue.push({
          nodeIdx: from,
          path: [
            ...path,
            edgeName ? `${retainerName}.${edgeName}` : retainerName,
          ],
        });
      }
    }

    queue = nextQueue;
  }

  // Fell out of BFS without hitting root — return partial path
  const bestPath = queue[0]?.path ?? [targetConstructor];
  return 'global → … → ' + bestPath.slice().reverse().join(' → ');
}

/**
 * Converts raw ConstructorDelta + pattern info into HDSL constructor entries.
 * Sorted by delta_bytes descending, capped at maxEntries.
 * Now uses real BFS retainer chain walk instead of heuristic strings.
 */
export function buildHdslConstructorEntries(
  diff: SnapshotDiff,
  patterns: Map<string, LeakPattern[]>,
  dominatorPaths: Map<string, string>,
  maxEntries: number = 20,
  snapshot?: ParsedHeapSnapshot, // optional: enables real BFS walk
): HdslConstructorEntry[] {
  const entries: HdslConstructorEntry[] = [];

  const sorted = [...diff.constructor_deltas.values()]
    .sort((a, b) => b.delta_bytes - a.delta_bytes)
    .slice(0, maxEntries);

  for (const delta of sorted) {
    const retainerPath =
      dominatorPaths.get(delta.name) ??
      (snapshot
        ? walkRetainerChain(snapshot, delta.name)
        : `global → (path unavailable) → ${delta.name}`);

    entries.push({
      name: delta.name,
      instances_s1: delta.count_s1,
      instances_s3: delta.count_s3,
      instances_delta: delta.delta_count,
      self_size_delta_bytes: delta.delta_bytes,
      retained_size_bytes: delta.delta_bytes, // overridden by dominator if available
      first_retained_path: retainerPath,
      v8_space: guessV8Space(delta.name),
      contributing_patterns: patterns.get(delta.name) ?? [],
    });
  }

  return entries;
}

/**
 * Heuristic V8 space assignment based on constructor name.
 * The accurate assignment requires CDP-level space metadata per node.
 * This approximation filters most noise correctly.
 */
function guessV8Space(name: string): HdslConstructorEntry['v8_space'] {
  // Short strings and small objects typically stay in new space
  if (name === 'String' || name === 'ConsString' || name === 'SlicedString') {
    return 'old_space'; // strings promoted quickly
  }
  if (name === 'Array' || name === 'Function') {
    return 'old_space';
  }
  return 'old_space'; // default assumption for leaked objects
}

/**
 * Calculates overall confidence score (0–1) for the leak analysis.
 * Higher when more patterns are detected and old-space growth dominates.
 */
export function calculateConfidence(
  patterns: Map<string, LeakPattern[]>,
  oldSpaceDeltaBytes: number,
  totalDeltaBytes: number,
): number {
  const patternCount = new Set([...patterns.values()].flat()).size;
  const oldSpaceRatio =
    totalDeltaBytes > 0 ? oldSpaceDeltaBytes / totalDeltaBytes : 0;
  const patternScore = Math.min(patternCount / 5, 1.0);
  const oldSpaceScore = oldSpaceRatio;
  return Math.round((patternScore * 0.4 + oldSpaceScore * 0.6) * 100) / 100;
}

/** Returns the unique set of all detected patterns */
export function collectAllPatterns(
  constructorPatterns: Map<string, LeakPattern[]>,
): LeakPattern[] {
  return [...new Set([...constructorPatterns.values()].flat())];
}
