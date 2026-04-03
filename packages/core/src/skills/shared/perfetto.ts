/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Perfetto Trace Format Utilities
 *
 * Generates Perfetto-compatible trace files for visualization in ui.perfetto.dev
 * Supports memory snapshots, CPU profiles, and heap analysis results.
 *
 * @see https://perfetto.dev/docs/reference/synthetic-track-event
 */

export interface PerfettoTracePacket {
  timestamp: number;
  type: 'track_descriptor' | 'track_event' | 'heap_profile' | 'memory_snapshot';
  data: unknown;
}

export interface TrackDescriptor {
  uuid: number;
  name: string;
  parentUuid?: number;
}

export interface MemoryTrackEvent {
  trackUuid: number;
  timestampUs: number;
  name: string;
  value: number;
  unit: 'bytes' | 'count' | 'percent';
}

export interface HeapProfileSample {
  trackUuid: number;
  timestampUs: number;
  size: number;
  count: number;
  stackTrace?: string[];
  objectType?: string;
}

/**
 * Generates a Perfetto trace file from memory/profiling data
 */
export class PerfettoTraceBuilder {
  private packets: PerfettoTracePacket[] = [];
  private trackCounter = 1;
  private readonly startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Create a new track for metrics
   */
  createTrack(name: string, parentUuid?: number): number {
    const uuid = this.trackCounter++;
    this.packets.push({
      timestamp: Date.now(),
      type: 'track_descriptor',
      data: {
        uuid,
        name,
        parentUuid,
      } as TrackDescriptor,
    });
    return uuid;
  }

  /**
   * Add a memory snapshot event
   */
  addMemorySnapshot(
    trackUuid: number,
    heapUsed: number,
    heapTotal: number,
    rss: number,
    external: number,
    metadata?: Record<string, number>,
  ): void {
    const timestampUs = Math.floor(performance.now() * 1000);

    this.packets.push({
      timestamp: Date.now(),
      type: 'memory_snapshot',
      data: {
        trackUuid,
        timestampUs,
        heapUsed,
        heapTotal,
        rss,
        external,
        metadata,
      },
    });
  }

  /**
   * Add heap profile sample
   */
  addHeapProfileSample(
    trackUuid: number,
    objectType: string,
    size: number,
    count: number,
    stackTrace?: string[],
  ): void {
    const timestampUs = Math.floor(performance.now() * 1000);

    this.packets.push({
      timestamp: Date.now(),
      type: 'heap_profile',
      data: {
        trackUuid,
        timestampUs,
        objectType,
        size,
        count,
        stackTrace,
      } as HeapProfileSample,
    });
  }

  /**
   * Add a counter event (ph: 'C') for numeric metrics like memory usage.
   */
  addCounterEvent(
    trackUuid: number,
    name: string,
    value: number,
    timestampUs?: number,
  ): void {
    const ts = timestampUs ?? Math.floor(performance.now() * 1000);
    this.packets.push({
      timestamp: Date.now(),
      type: 'track_event',
      data: {
        ph: 'C',
        trackUuid,
        name,
        ts,
        pid: trackUuid,
        tid: trackUuid,
        args: { [name]: value },
      },
    });
  }

  /**
   * Add a duration begin event (ph: 'B').
   */
  addDurationBegin(
    trackUuid: number,
    name: string,
    timestampUs?: number,
  ): void {
    const ts = timestampUs ?? Math.floor(performance.now() * 1000);
    this.packets.push({
      timestamp: Date.now(),
      type: 'track_event',
      data: { ph: 'B', trackUuid, name, ts, pid: trackUuid, tid: trackUuid },
    });
  }

  /**
   * Add a duration end event (ph: 'E').
   */
  addDurationEnd(trackUuid: number, timestampUs?: number): void {
    const ts = timestampUs ?? Math.floor(performance.now() * 1000);
    this.packets.push({
      timestamp: Date.now(),
      type: 'track_event',
      data: { ph: 'E', trackUuid, ts, pid: trackUuid, tid: trackUuid },
    });
  }

  /**
   * Add a complete event (ph: 'X') with explicit start and duration.
   */
  addCompleteEvent(
    trackUuid: number,
    name: string,
    startUs: number,
    durationUs: number,
    args?: Record<string, unknown>,
  ): void {
    this.packets.push({
      timestamp: Date.now(),
      type: 'track_event',
      data: {
        ph: 'X',
        trackUuid,
        name,
        ts: startUs,
        dur: durationUs,
        pid: trackUuid,
        tid: trackUuid,
        args,
      },
    });
  }

  /**
   * Add leak report as a series of counter and instant events.
   * Each leak candidate becomes a complete event on the track.
   */
  addLeakReport(leakReport: PerfettoLeakReport): void {
    const trackUuid = this.createTrack('LeakReport');
    const baseTs = leakReport.analysisTimestamp * 1000; // convert ms → µs

    this.addCounterEvent(
      trackUuid,
      'totalLeakedBytes',
      leakReport.totalLeakedBytes,
      baseTs,
    );
    this.addCounterEvent(
      trackUuid,
      'snapshotSize_s1',
      leakReport.snapshotSizes[0],
      baseTs,
    );
    this.addCounterEvent(
      trackUuid,
      'snapshotSize_s2',
      leakReport.snapshotSizes[1],
      baseTs + 1,
    );
    this.addCounterEvent(
      trackUuid,
      'snapshotSize_s3',
      leakReport.snapshotSizes[2],
      baseTs + 2,
    );

    leakReport.candidates.forEach((c, i) => {
      this.addCompleteEvent(
        trackUuid,
        `leak:${c.constructorName}`,
        baseTs + 100 + i * 10,
        1,
        {
          nodeId: c.nodeId,
          count: c.count,
          retainedSizeDelta: c.retainedSizeDelta,
          confidence: c.confidence,
        },
      );
    });
  }

  /**
   * Build the final trace JSON (Chrome Trace Format).
   * pid/tid are derived from trackUuid for multi-track separation.
   */
  build(): string {
    return this.buildChromeTrace();
  }

  /**
   * Build proper Chrome Trace JSON with pid/tid based on trackUuid.
   */
  buildChromeTrace(): string {
    function asNum(v: unknown, fallback: number): number {
      return typeof v === 'number' ? v : fallback;
    }
    function asStr(v: unknown, fallback: string): string {
      return typeof v === 'string' ? v : fallback;
    }
    function asNumOrUndef(v: unknown): number | undefined {
      return typeof v === 'number' ? v : undefined;
    }
    function asRecordOrUndef(v: unknown): Record<string, unknown> | undefined {
      if (typeof v === 'object' && v !== null) {
        const rec: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) rec[k] = val;
        return rec;
      }
      return undefined;
    }

    const traceEvents = this.packets.map((p) => {
      const d: Record<string, unknown> =
        typeof p.data === 'object' && p.data !== null
          ? Object.fromEntries(Object.entries(p.data))
          : {};
      if (p.type === 'track_descriptor') {
        return {
          name: 'process_name',
          ph: 'M',
          pid: asNum(d['uuid'], 1),
          tid: asNum(d['uuid'], 1),
          ts: p.timestamp * 1000,
          args: { name: d['name'] },
        };
      }
      if (p.type === 'track_event') {
        // Already has ph/ts/pid/tid from addCounterEvent etc.
        return {
          name: asStr(d['name'], p.type),
          ph: asStr(d['ph'], 'X'),
          ts: asNum(d['ts'], p.timestamp * 1000),
          pid: asNum(d['pid'], 1),
          tid: asNum(d['tid'], 1),
          dur: asNumOrUndef(d['dur']),
          args: asRecordOrUndef(d['args']),
        };
      }
      // memory_snapshot, heap_profile
      return {
        name: p.type,
        ph: 'X',
        ts: p.timestamp * 1000,
        pid: 1,
        tid: 1,
        args: p.data,
      };
    });

    return JSON.stringify({
      traceEvents,
      metadata: {
        source: 'gemini-cli-investigate',
        version: '1.0',
        startTime: this.startTime,
      },
    });
  }

  /**
   * Save trace to file
   */
  async saveToFile(filePath: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, this.build(), 'utf-8');
  }
}

/**
 * Parse Node.js heap snapshot format
 */
/**
 * Minimal LeakReport shape used by addLeakReport().
 * The full definition lives in diff-engine.ts.
 */
export interface PerfettoLeakReport {
  candidates: Array<{
    nodeId: number;
    constructorName: string;
    count: number;
    retainedSizeDelta: number;
    confidence: string;
  }>;
  totalLeakedBytes: number;
  snapshotSizes: [number, number, number];
  analysisTimestamp: number;
}

export interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: Array<string | string[]>;
      edge_fields: string[];
      edge_types: Array<string | string[]>;
    };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

/**
 * Analyze heap snapshot for suspicious patterns
 */
export function analyzeHeapSnapshot(snapshot: HeapSnapshot): {
  suspiciousPatterns: string[];
  topObjectTypes: Array<{ type: string; count: number; size: number }>;
  potentialLeaks: Array<{
    type: string;
    count: number;
    retainerPath: string[];
  }>;
} {
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const typeIndex = nodeFields.indexOf('type');
  const nameIndex = nodeFields.indexOf('name');
  const selfSizeIndex = nodeFields.indexOf('self_size');
  const nodeSize = nodeFields.length;

  const typeStats = new Map<string, { count: number; size: number }>();

  // Process all nodes
  for (let i = 0; i < snapshot.nodes.length; i += nodeSize) {
    const typeIdx = snapshot.nodes[i + typeIndex];
    const rawType = snapshot.snapshot.meta.node_types[0][typeIdx];
    const type = typeof rawType === 'string' ? rawType : String(rawType);
    const nameIdx = snapshot.nodes[i + nameIndex];
    const name = snapshot.strings[nameIdx];
    const size = snapshot.nodes[i + selfSizeIndex];

    const key = name || type;
    const existing = typeStats.get(key) || { count: 0, size: 0 };
    existing.count++;
    existing.size += size;
    typeStats.set(key, existing);
  }

  // Sort by count and size
  const sortedByCount = [...typeStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([type, stats]) => ({ type, ...stats }));

  // Detect suspicious patterns
  const suspiciousPatterns: string[] = [];
  const potentialLeaks: Array<{
    type: string;
    count: number;
    retainerPath: string[];
  }> = [];

  // Check for detached DOM nodes (common leak pattern)
  const detachedNodes = sortedByCount.filter(
    (item) =>
      item.type.includes('Detached') ||
      item.type.includes('detached') ||
      item.type.includes('HTMLElement'),
  );

  if (detachedNodes.length > 0) {
    suspiciousPatterns.push(
      `Found ${detachedNodes.length} detached DOM node types - potential DOM leak`,
    );
    potentialLeaks.push(
      ...detachedNodes.slice(0, 5).map((n) => ({
        type: n.type,
        count: n.count,
        retainerPath: ['window', 'document', n.type],
      })),
    );
  }

  // Check for large arrays/objects
  const largeArrays = sortedByCount.filter(
    (item) => item.type.includes('Array') && item.count > 1000,
  );
  if (largeArrays.length > 0) {
    suspiciousPatterns.push(
      `Found ${largeArrays.length} large array types (>1000 instances)`,
    );
  }

  return {
    suspiciousPatterns,
    topObjectTypes: sortedByCount,
    potentialLeaks,
  };
}

/**
 * Calculate diff between two heap snapshots
 */
export function diffHeapSnapshots(
  before: HeapSnapshot,
  after: HeapSnapshot,
): {
  added: Array<{ type: string; count: number; size: number }>;
  removed: Array<{ type: string; count: number; size: number }>;
  grown: Array<{
    type: string;
    countDelta: number;
    sizeDelta: number;
    growthRate: number;
  }>;
} {
  const beforeStats = extractTypeStats(before);
  const afterStats = extractTypeStats(after);

  const added: Array<{ type: string; count: number; size: number }> = [];
  const removed: Array<{ type: string; count: number; size: number }> = [];
  const grown: Array<{
    type: string;
    countDelta: number;
    sizeDelta: number;
    growthRate: number;
  }> = [];

  // Find added and grown objects
  for (const [type, afterStat] of afterStats) {
    const beforeStat = beforeStats.get(type);
    if (!beforeStat) {
      added.push({ type, count: afterStat.count, size: afterStat.size });
    } else if (afterStat.count > beforeStat.count) {
      const countDelta = afterStat.count - beforeStat.count;
      const sizeDelta = afterStat.size - beforeStat.size;
      grown.push({
        type,
        countDelta,
        sizeDelta,
        growthRate: countDelta / beforeStat.count,
      });
    }
  }

  // Find removed objects
  for (const [type, beforeStat] of beforeStats) {
    if (!afterStats.has(type)) {
      removed.push({ type, count: beforeStat.count, size: beforeStat.size });
    }
  }

  // Sort grown by growth rate
  grown.sort((a, b) => b.growthRate - a.growthRate);

  return { added, removed, grown };
}

function extractTypeStats(
  snapshot: HeapSnapshot,
): Map<string, { count: number; size: number }> {
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const nameIndex = nodeFields.indexOf('name');
  const selfSizeIndex = nodeFields.indexOf('self_size');
  const nodeSize = nodeFields.length;

  const stats = new Map<string, { count: number; size: number }>();

  for (let i = 0; i < snapshot.nodes.length; i += nodeSize) {
    const nameIdx = snapshot.nodes[i + nameIndex];
    const name = snapshot.strings[nameIdx];
    const size = snapshot.nodes[i + selfSizeIndex];

    const key = name || 'unknown';
    const existing = stats.get(key) || { count: 0, size: 0 };
    existing.count++;
    existing.size += size;
    stats.set(key, existing);
  }

  return stats;
}
