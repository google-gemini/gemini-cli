/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * types.ts — Shared type definitions for the heapsnapshot memory
 * investigation prototype.
 */

// ── V8 Heap Snapshot Structure ──

/** Top-level V8 .heapsnapshot JSON structure. */
export interface HeapSnapshot {
  snapshot: {
    meta: SnapshotMeta;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

/** Metadata section within a V8 heap snapshot. */
export interface SnapshotMeta {
  node_fields: string[];
  node_types?: (string[] | string)[];
  edge_fields: string[];
  edge_types?: (string[] | string)[];
}

// ── Parser / Diff Types ──

/** Per-constructor aggregation from a parsed snapshot. */
export interface ConstructorStats {
  count: number;
  selfSize: number;
  nodeType: string;
}

/** A single entry in the diff output. */
export interface DiffEntry {
  name: string;
  nodeType: string;
  sizeDelta: number;
  countDelta: number;
  currentSize: number;
  currentCount: number;
}

/** A ranked diff entry with an actionability score. */
export interface RankedDiffEntry extends DiffEntry {
  actionabilityScore: number;
}

/** Options for the diffSnapshots function. */
export interface DiffOptions {
  topK?: number;
  filterSystem?: boolean;
  noiseFloor?: number;
}

// ── Retainer Chain Types ──

/** Index built from a V8 snapshot for fast lookups. */
export interface NodeIndex {
  nodeCount: number;
  nodeStride: number;
  edgeStride: number;
  typeOff: number;
  nameOff: number;
  idOff: number;
  selfSizeOff: number;
  edgeCountOff: number;
  edgeTypeOff: number;
  edgeNameOrIndexOff: number;
  edgeToNodeOff: number;
  nodeTypes: string[];
  edgeTypes: string[];
  nodes: number[];
  edges: number[];
  strings: string[];
  firstEdgeOffsets: number[];
}

/** A single step in a retainer chain path. */
export interface RetainerStep {
  from: string;
  edgeType: string;
  edgeName: string;
  to: string;
}

/** A complete retainer chain from a target node toward roots. */
export interface RetainerChain {
  reachesRoot: boolean;
  depth: number;
  score: number;
  nodes: RetainerStep[];
}

/** Result of walking retainers for one anomaly constructor. */
export interface RetainerResult {
  anomaly: string;
  chains: RetainerChain[];
}

/** A single reverse-edge entry. */
export interface ReverseEdge {
  fromOrdinal: number;
  toOrdinal: number;
  edgeType: string;
  edgeName: string;
}

/** Options for the walkRetainers function. */
export interface WalkRetainersOptions {
  maxDepth?: number;
  maxChainsPerType?: number;
  limitPerType?: number;
  skipWeakEdges?: boolean;
}

// ── Trace Types ──

/** A single Chrome JSON Trace Event. */
export interface TraceEvent {
  ph: string;
  pid: number;
  tid: number;
  ts?: number;
  dur?: number;
  name: string;
  cat?: string;
  s?: string;
  args?: Record<string, unknown>;
}

/** Complete Chrome trace output. */
export interface TraceOutput {
  traceEvents: TraceEvent[];
  metadata: Record<string, unknown>;
}

/** Diff summary structure passed to the trace converter. */
export interface DiffSummary {
  timestamp: string;
  nodeVersion?: string;
  v8Version?: string;
  snapshots?: {
    count?: number;
    intervalMs?: number;
    paths?: string[];
  };
  anomalies?: DiffEntry[];
  retainer_chains?: RetainerResult[];
}

/** Options for convertToTraceEvents. */
export interface TraceOptions {
  processName?: string;
  pid?: number;
  tid?: number;
}

// ── Capture Types ──

/** Result of capturing a single snapshot. */
export interface SnapshotResult {
  path: string;
  sizeBytes: number;
}

/** Options for captureSnapshots. */
export interface CaptureOptions {
  count?: number;
  intervalMs?: number;
  outputDir?: string;
}

// ── Render Types ──

/** Metadata for render table display. */
export interface RenderMeta {
  snapshot1?: string;
  snapshot2?: string;
  totalCaptures?: number;
  totalTimeMs?: number;
}
