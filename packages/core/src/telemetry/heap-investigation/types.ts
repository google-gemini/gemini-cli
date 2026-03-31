/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HeapDelta Semantic Language (HDSL) — the compact, LLM-parseable format
 * produced at the end of a heap investigation. Always < 5 KB.
 */
export interface HdslReport {
  hdsl_version: '1.0';
  investigation_id: string;
  timestamp_ms: number;
  duration_ms: number;
  trigger: HdslTrigger;
  v8_spaces: HdslV8SpaceBreakdown;
  constructors: HdslConstructorEntry[];
  detached_nodes: HdslDetachedNodes;
  patterns: LeakPattern[];
  confidence: number;
  payload_bytes: number;
  perfetto_path?: string;
}

export interface HdslTrigger {
  /** 'threshold' = auto via HighWaterMarkTracker, 'manual' = user-initiated */
  type: 'threshold' | 'manual';
  /** Human-readable reason string */
  reason: string;
  /** v8.getHeapStatistics().used_heap_size at trigger time (0 for manual) */
  heap_used_bytes: number;
  /** Unix timestamp in ms when the trigger fired */
  triggered_at_ms: number;
  /** Legacy fields kept for HDSL backward compat */
  metric?: 'heap_used' | 'rss';
  growth_percent?: number;
  absolute_bytes?: number;
  previous_high_water_mark_bytes?: number;
  session_uptime_ms?: number;
}

export interface HdslV8SpaceBreakdown {
  /** Old generation growth — the real signal for leaks */
  old_space_delta_bytes: number;
  /** New space churn — ephemeral, filtered from leak analysis */
  new_space_delta_bytes: number;
  code_space_delta_bytes: number;
  large_object_space_delta_bytes: number;
  total_heap_delta_bytes: number;
}

export interface HdslConstructorEntry {
  name: string;
  instances_s1: number;
  instances_s3: number;
  instances_delta: number;
  self_size_delta_bytes: number;
  retained_size_bytes: number;
  /** Shortest path from GC root, from Dominator Tree traversal */
  first_retained_path: string;
  /** Which space this constructor lives in */
  v8_space: V8SpaceName;
  /** Pattern(es) this constructor contributes to */
  contributing_patterns: LeakPattern[];
}

export interface HdslDetachedNodes {
  count: number;
  top_constructors: string[];
  detachedness_source: 'v8_detachedness_field' | 'heuristic';
}

export type LeakPattern =
  | 'event_listener_accumulation'
  | 'closure_scope_capture'
  | 'unbounded_cache'
  | 'array_accumulation'
  | 'timer_leak'
  | 'global_reference'
  | 'promise_chain_buildup'
  | 'circular_reference'
  | 'detached_dom_subtree';

export type V8SpaceName =
  | 'new_space'
  | 'old_space'
  | 'code_space'
  | 'large_object_space'
  | 'unknown';

/** Raw V8 flat-array snapshot loaded into memory-efficient typed arrays */
export interface ParsedHeapSnapshot {
  snapshot_id: string;
  timestamp_ms: number;
  /** node_count * NODE_FIELDS_COUNT entries */
  nodes: Uint32Array;
  /** edge_count * EDGE_FIELDS_COUNT entries */
  edges: Uint32Array;
  /** String lookup table */
  strings: string[];
  node_fields: string[];
  edge_fields: string[];
  node_types: string[][];
  edge_types: string[];
  node_count: number;
  edge_count: number;
  /** Byte offset into nodes array for each node (precomputed for O(1) lookup) */
  node_offsets: Uint32Array;
  /** First edge index for each node */
  first_edge_indices: Uint32Array;
}

/** Result of diffing two or three snapshots */
export interface SnapshotDiff {
  s1_id: string;
  s3_id: string;
  /** Node IDs present in S3 but NOT in S1 (leaked = ∩ filter with S2) */
  leaked_node_ids: Set<number>;
  /** Constructor name → {delta_count, delta_bytes} */
  constructor_deltas: Map<string, ConstructorDelta>;
}

export interface ConstructorDelta {
  name: string;
  count_s1: number;
  count_s3: number;
  delta_count: number;
  self_size_s1: number;
  self_size_s3: number;
  delta_bytes: number;
}

/** Dominator tree node — each node's immediate dominator and retained size */
export interface DominatorNode {
  node_id: number;
  immediate_dominator_id: number;
  self_size: number;
  retained_size: number;
  depth: number;
}

/** Output from the dominator worker thread */
export interface DominatorResult {
  /** nodeId → DominatorNode */
  dominator_map: Map<number, DominatorNode>;
  /** Top N nodes by retained_size */
  top_retained: DominatorNode[];
}

/** A Perfetto-compatible Chrome Trace Event */
export interface PerfettoEvent {
  ph: 'B' | 'E' | 'X' | 'C' | 'i' | 's' | 'f';
  ts: number;
  pid: number;
  tid: number;
  name: string;
  cat?: string;
  args?: Record<string, unknown>;
  dur?: number;
  id?: string;
  bp?: 'e';
}

export interface InvestigationOptions {
  /** Milliseconds between snapshot captures (default: 30000) */
  phase_interval_ms?: number;
  /** Max number of constructor entries in HDSL (default: 20) */
  max_constructor_entries?: number;
  /** Minimum old-space delta bytes to trigger pattern analysis (default: 1MB) */
  min_delta_bytes?: number;
  /** Directory to write Perfetto trace file (default: os.tmpdir()) */
  output_dir?: string;
  /** Whether to emit Perfetto trace files */
  emit_perfetto?: boolean;
}

export type InvestigationPhase =
  | 'idle'
  | 'baseline'
  | 'workload'
  | 'stabilizing'
  | 'analyzing'
  | 'complete'
  | 'error';

export interface InvestigationProgress {
  phase: InvestigationPhase;
  phase_index: number;
  total_phases: number;
  message: string;
  elapsed_ms: number;
}
