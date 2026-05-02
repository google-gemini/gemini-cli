/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

/**
 * Core type definitions for the Performance & Memory Investigation Companion.
 *
 * All interfaces are designed to match the V8 heap snapshot format and
 * Chrome Trace Event format used by Perfetto.
 */

// ─── Heap Snapshot Types ─────────────────────────────────────────────

/** Metadata from the V8 heap snapshot header. */
export interface HeapSnapshotMeta {
  readonly nodeFields: readonly string[];
  readonly nodeTypes: ReadonlyArray<string | string[]>;
  readonly edgeFields: readonly string[];
  readonly edgeTypes: ReadonlyArray<string | string[]>;
  readonly traceFunctionInfoFields: readonly string[];
  readonly traceNodeFields: readonly string[];
  readonly sampleFields: readonly string[];
  readonly locationFields: readonly string[];
}

/** A single node in the heap graph. */
export interface HeapNode {
  readonly type: string;
  readonly name: string;
  readonly id: number;
  readonly selfSize: number;
  readonly edgeCount: number;
  readonly traceNodeId: number;
  readonly detachedness: number;
  /** Raw index into the flat nodes array. */
  readonly nodeIndex: number;
}

/** A single edge in the heap graph. */
export interface HeapEdge {
  readonly type: string;
  readonly nameOrIndex: string | number;
  readonly toNodeIndex: number;
  readonly fromNodeIndex: number;
}

/** Summary statistics for a parsed heap snapshot. */
export interface HeapSnapshotSummary {
  readonly totalSize: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly stringCount: number;
  readonly topConstructors: readonly ConstructorGroup[];
  readonly detachedDomNodes: number;
  /** Approximate RSS consumed during parsing (bytes). */
  readonly parsingMemoryUsed: number;
  readonly parseTimeMs: number;
}

/** Aggregation of objects by constructor name. */
export interface ConstructorGroup {
  readonly constructor: string;
  readonly count: number;
  readonly totalSize: number;
  readonly averageSize: number;
  /** Percentage of total heap size. */
  readonly sizePercentage: number;
}

// ─── Snapshot Diff Types ─────────────────────────────────────────────

/** Object growth record from comparing two snapshots. */
export interface ObjectGrowthRecord {
  readonly constructor: string;
  readonly countBefore: number;
  readonly countAfter: number;
  readonly deltaCount: number;
  readonly sizeBefore: number;
  readonly sizeAfter: number;
  readonly deltaSizeBytes: number;
  /** Growth rate: deltaCount / countBefore. */
  readonly growthRate: number;
}

/** A chain of retainers keeping an object alive. */
export interface RetainerChain {
  readonly depth: number;
  readonly nodes: readonly RetainerNode[];
  readonly totalRetainedSize: number;
}

/** A single node in a retainer chain. */
export interface RetainerNode {
  readonly type: string;
  readonly name: string;
  readonly edgeType: string;
  readonly edgeName: string;
  readonly selfSize: number;
}

/** Result of the 3-snapshot technique. */
export interface ThreeSnapshotDiffResult {
  /** Objects present in C but not in A (leak candidates). */
  readonly leakCandidates: readonly ObjectGrowthRecord[];
  /** Objects present in both B and C but not A (strong candidates). */
  readonly strongLeakCandidates: readonly ObjectGrowthRecord[];
  /** Top retainer chains for the strongest candidates. */
  readonly retainerChains: readonly RetainerChain[];
  /** Summary statistics. */
  readonly summary: {
    readonly totalNewObjects: number;
    readonly totalNewSize: number;
    readonly strongCandidateCount: number;
    readonly topLeakingConstructor: string;
  };
}

// ─── CPU Profile Types ───────────────────────────────────────────────

/** Parsed CPU profile data. */
export interface CpuProfileData {
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly sampleCount: number;
  readonly hotFunctions: readonly HotFunction[];
  readonly topLevelCategories: readonly CategoryBreakdown[];
}

/** A function that consumed significant CPU time. */
export interface HotFunction {
  readonly functionName: string;
  readonly scriptName: string;
  readonly lineNumber: number;
  readonly columnNumber: number;
  /** Self time in microseconds. */
  readonly selfTime: number;
  /** Total time (self + callees) in microseconds. */
  readonly totalTime: number;
  /** Percentage of total profile time. */
  readonly selfPercentage: number;
  readonly hitCount: number;
}

/** CPU time breakdown by category. */
export interface CategoryBreakdown {
  readonly category: string;
  readonly totalTime: number;
  readonly percentage: number;
}

// ─── Perfetto / Chrome Trace Event Types ─────────────────────────────

/**
 * Chrome Trace Event Format (JSON).
 * @see https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
 */
export interface PerfettoTraceEvent {
  /** Event name. */
  readonly name: string;
  /** Category string. */
  readonly cat: string;
  /** Phase: B=begin, E=end, X=complete, i=instant, C=counter, M=metadata. */
  readonly ph: 'B' | 'E' | 'X' | 'i' | 'C' | 'M';
  /** Timestamp in microseconds. */
  readonly ts: number;
  /** Duration in microseconds (for ph='X' complete events). */
  readonly dur?: number;
  /** Process ID. */
  readonly pid: number;
  /** Thread ID. */
  readonly tid: number;
  /** Event-specific arguments. */
  readonly args?: Readonly<Record<string, unknown>>;
}

/** A complete Perfetto-compatible trace. */
export interface PerfettoTrace {
  readonly traceEvents: readonly PerfettoTraceEvent[];
  readonly metadata?: {
    readonly title?: string;
    readonly generatedBy?: string;
    readonly timestamp?: string;
    readonly [key: string]: unknown;
  };
}

// ─── Tool Integration Types ──────────────────────────────────────────

/** Options for heap snapshot capture. */
export interface CaptureOptions {
  readonly target: 'self' | 'remote';
  readonly host?: string;
  readonly port?: number;
  readonly label?: string;
  readonly outputDir?: string;
  readonly forceGc?: boolean;
  readonly timeoutMs?: number;
}

/** Result returned by capture operations. */
export interface CaptureResult {
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly label: string;
  readonly timestamp: number;
}

/** Analysis request options. */
export interface AnalysisOptions {
  readonly mode: 'summary' | 'diff' | 'leak-detect' | 'growth';
  readonly topN?: number;
  readonly minSizeBytes?: number;
  readonly outputFormat?: 'markdown' | 'json' | 'perfetto';
  readonly perfettoOutputPath?: string;
}

/** Result of any analysis operation. */
export interface AnalysisResult {
  readonly summary: string;
  readonly markdownReport: string;
  /** Structured text optimized for LLM consumption. */
  readonly llmContext: string;
  readonly perfettoTrace?: PerfettoTrace;
  readonly suggestions: readonly string[];
}
