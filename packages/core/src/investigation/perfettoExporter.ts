/**
 * PerfettoExporter — Converts investigation results into Perfetto-compatible
 * JSON trace format for visualization in ui.perfetto.dev.
 *
 * Supports:
 *   - Chrome JSON trace event format (legacy but widely supported)
 *   - Duration events (B/E pairs), complete events (X), counter events (C)
 *   - Memory counter tracks for heap size over time
 *   - Allocation flamecharts from heap snapshots
 *   - CPU profiling data from V8 profiles
 *   - Custom metadata and process/thread naming
 *
 * Output can be opened directly in:
 *   - ui.perfetto.dev (drag & drop)
 *   - chrome://tracing
 *   - Android Studio profiler
 *
 * @module investigation/perfettoExporter
 */

import type { LeakReport, ClassSummary, HeapNode, RetainerChain } from './heapSnapshotAnalyzer.js';

// ─── Perfetto Trace Event Types ──────────────────────────────────────────────

/**
 * Chrome JSON trace event format.
 * See: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
 */
export interface TraceEvent {
  /** Process ID */
  pid: number;
  /** Thread ID */
  tid: number;
  /** Timestamp in microseconds */
  ts: number;
  /** Phase: B=begin, E=end, X=complete, C=counter, I=instant, M=metadata */
  ph: 'B' | 'E' | 'X' | 'C' | 'I' | 'M' | 'N' | 'O' | 'D';
  /** Event name */
  name: string;
  /** Category */
  cat?: string;
  /** Duration in microseconds (for X events) */
  dur?: number;
  /** Arguments */
  args?: Record<string, unknown>;
  /** Color name (for Perfetto UI) */
  cname?: string;
  /** Stack frame ID */
  sf?: number;
  /** Event scope */
  s?: 'g' | 'p' | 't';
  /** Thread timestamp */
  tts?: number;
  /** ID for async events */
  id?: string;
}

/** Complete Perfetto trace file */
export interface PerfettoTrace {
  traceEvents: TraceEvent[];
  metadata?: Record<string, unknown>;
  displayTimeUnit?: 'ms' | 'ns';
}

/** Options for trace generation */
export interface PerfettoExportOptions {
  /** Process ID to use (default: 1) */
  pid?: number;
  /** Process name shown in Perfetto UI */
  processName?: string;
  /** Thread name shown in Perfetto UI */
  threadName?: string;
  /** Include memory counter track */
  includeMemoryCounters?: boolean;
  /** Include allocation flamechart */
  includeAllocations?: boolean;
  /** Include leak annotations as instant events */
  includeLeakAnnotations?: boolean;
  /** Time base: microsecond timestamp of "time zero" */
  timeBase?: number;
  /** Interval between snapshot timestamps in microseconds (default: 30s) */
  snapshotInterval?: number;
}

// ─── Colors for Perfetto UI ──────────────────────────────────────────────────

const COLORS = {
  leak: 'terrible',        // Red
  growth: 'bad',           // Orange
  allocation: 'good',      // Green
  gc: 'olive',             // Olive
  snapshot: 'rail_idle',   // Blue
  memory: 'cq_build_running',
  analysis: 'generic_work',
} as const;

// ─── Exporter ────────────────────────────────────────────────────────────────

export class PerfettoExporter {
  private events: TraceEvent[] = [];
  private pid: number;
  private tid: number;
  private timeBase: number;
  private snapshotInterval: number;

  constructor(options: PerfettoExportOptions = {}) {
    this.pid = options.pid ?? 1;
    this.tid = 1;
    this.timeBase = options.timeBase ?? 0;
    this.snapshotInterval = options.snapshotInterval ?? 30_000_000; // 30 seconds in μs

    // Add process and thread metadata
    this.events.push({
      pid: this.pid,
      tid: 0,
      ts: 0,
      ph: 'M',
      name: 'process_name',
      args: { name: options.processName ?? 'Gemini CLI Investigation' },
    });

    this.events.push({
      pid: this.pid,
      tid: this.tid,
      ts: 0,
      ph: 'M',
      name: 'thread_name',
      args: { name: options.threadName ?? 'Memory Analysis' },
    });
  }

  /**
   * Export a 3-snapshot leak report as a Perfetto trace.
   *
   * Creates:
   *   - Memory counter track showing heap growth
   *   - Snapshot capture duration events
   *   - Leak annotations as instant events with retainer chains
   *   - Analysis phase duration events
   *   - Per-class allocation flamechart
   */
  exportLeakReport(report: LeakReport, options: PerfettoExportOptions = {}): PerfettoTrace {
    const includeMemory = options.includeMemoryCounters !== false;
    const includeLeaks = options.includeLeakAnnotations !== false;
    const includeAllocations = options.includeAllocations !== false;

    // ── Memory counter track ──
    if (includeMemory) {
      this.addMemoryCounters(report.snapshotSizes);
    }

    // ── Snapshot capture events ──
    for (let i = 0; i < 3; i++) {
      const ts = this.timeBase + i * this.snapshotInterval;
      this.events.push({
        pid: this.pid,
        tid: this.tid,
        ts,
        ph: 'X',
        name: `Heap Snapshot ${i + 1}`,
        cat: 'memory',
        dur: 500_000, // 500ms capture time
        args: {
          size_bytes: report.snapshotSizes[i],
          size_mb: (report.snapshotSizes[i] / (1024 * 1024)).toFixed(2),
        },
        cname: COLORS.snapshot,
      });
    }

    // ── Analysis phase ──
    const analysisStart = this.timeBase + 3 * this.snapshotInterval;
    this.events.push({
      pid: this.pid,
      tid: this.tid,
      ts: analysisStart,
      ph: 'X',
      name: 'Leak Analysis',
      cat: 'analysis',
      dur: 2_000_000, // 2 seconds
      args: {
        candidates_found: report.leakCandidates.length,
        high_confidence: report.leakCandidates.filter(c => c.confidence === 'high').length,
        net_growth_bytes: report.snapshotSizes[2] - report.snapshotSizes[0],
      },
      cname: COLORS.analysis,
    });

    // ── Leak annotations ──
    if (includeLeaks) {
      this.addLeakAnnotations(report, analysisStart + 2_500_000);
    }

    // ── Per-class allocation breakdown ──
    if (includeAllocations) {
      this.addAllocationBreakdown(report, analysisStart + 3_000_000);
    }

    return {
      traceEvents: this.events,
      metadata: {
        source: 'gemini-cli-investigation',
        version: '1.0.0',
        timestamp: report.timestamp,
        summary: report.summary,
      },
      displayTimeUnit: 'ms',
    };
  }

  /**
   * Export class summaries as a flamechart showing memory distribution.
   * Each class becomes a duration event proportional to its retained size.
   */
  exportClassSummaries(
    summaries: ClassSummary[],
    totalSize: number,
    label: string = 'Heap Distribution',
  ): void {
    const ts = this.timeBase;
    const tid = this.tid + 1; // Separate thread for class breakdown

    this.events.push({
      pid: this.pid,
      tid,
      ts: 0,
      ph: 'M',
      name: 'thread_name',
      args: { name: label },
    });

    // Total heap as parent event
    const totalDur = Math.max(totalSize / 100, 1000); // Scale: 1 byte = 0.01 μs
    this.events.push({
      pid: this.pid,
      tid,
      ts,
      ph: 'X',
      name: `Total Heap (${(totalSize / (1024 * 1024)).toFixed(1)} MB)`,
      cat: 'heap',
      dur: totalDur,
      args: { total_bytes: totalSize },
    });

    // Top classes as nested events
    let offset = 0;
    for (const cls of summaries.slice(0, 30)) {
      const dur = totalSize > 0 ? Math.max((cls.retainedSize / totalSize) * totalDur, 1) : 1;
      this.events.push({
        pid: this.pid,
        tid,
        ts: ts + offset,
        ph: 'X',
        name: `${cls.className} (${cls.count})`,
        cat: 'class',
        dur,
        args: {
          count: cls.count,
          shallow_size: cls.shallowSize,
          retained_size: cls.retainedSize,
          avg_size: cls.count > 0 ? Math.round(cls.shallowSize / cls.count) : 0,
        },
        cname: cls.retainedSize > totalSize * 0.1 ? COLORS.growth : COLORS.allocation,
      });
      offset += dur;
    }
  }

  /**
   * Export CPU profiling data from V8 CPU profiles.
   * Converts the V8 CPU profile format to Perfetto-compatible events.
   */
  exportCpuProfile(profile: V8CpuProfile): void {
    const tid = this.tid + 2;

    this.events.push({
      pid: this.pid,
      tid,
      ts: 0,
      ph: 'M',
      name: 'thread_name',
      args: { name: 'CPU Profile' },
    });

    // Convert profile nodes to duration events
    if (profile.nodes && profile.timeDeltas && profile.samples) {
      let currentTime = profile.startTime;

      for (let i = 0; i < profile.samples.length; i++) {
        const nodeId = profile.samples[i];
        const delta = profile.timeDeltas[i] ?? 0;
        const node = profile.nodes.find(n => n.id === nodeId);

        if (node && node.callFrame) {
          this.events.push({
            pid: this.pid,
            tid,
            ts: currentTime,
            ph: 'X',
            name: node.callFrame.functionName || '(anonymous)',
            cat: 'cpu',
            dur: delta,
            args: {
              url: node.callFrame.url,
              lineNumber: node.callFrame.lineNumber,
              columnNumber: node.callFrame.columnNumber,
            },
          });
        }

        currentTime += delta;
      }
    }
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  private addMemoryCounters(sizes: [number, number, number]): void {
    const counterTid = 0; // Counter events use tid=0 by convention

    for (let i = 0; i < 3; i++) {
      const ts = this.timeBase + i * this.snapshotInterval;
      this.events.push({
        pid: this.pid,
        tid: counterTid,
        ts,
        ph: 'C',
        name: 'Heap Size',
        args: {
          'heap_size_mb': Number((sizes[i] / (1024 * 1024)).toFixed(2)),
          'heap_size_bytes': sizes[i],
        },
      });

      // Also add growth rate counter (for snapshots 2 and 3)
      if (i > 0) {
        const growth = sizes[i] - sizes[i - 1];
        this.events.push({
          pid: this.pid,
          tid: counterTid,
          ts,
          ph: 'C',
          name: 'Heap Growth',
          args: {
            'growth_bytes': growth,
            'growth_kb': Number((growth / 1024).toFixed(1)),
          },
        });
      }
    }
  }

  private addLeakAnnotations(report: LeakReport, startTs: number): void {
    let offset = 0;
    const leakTid = this.tid + 3;

    this.events.push({
      pid: this.pid,
      tid: leakTid,
      ts: 0,
      ph: 'M',
      name: 'thread_name',
      args: { name: 'Leak Candidates' },
    });

    for (const candidate of report.leakCandidates.slice(0, 10)) {
      const color = candidate.confidence === 'high' ? COLORS.leak :
                    candidate.confidence === 'medium' ? COLORS.growth :
                    COLORS.allocation;

      // Duration event for each candidate (proportional to leaked size)
      const dur = Math.max(candidate.totalLeakedSize / 10, 100_000);
      this.events.push({
        pid: this.pid,
        tid: leakTid,
        ts: startTs + offset,
        ph: 'X',
        name: `LEAK: ${candidate.className}`,
        cat: 'leak',
        dur,
        args: {
          confidence: candidate.confidence,
          count_progression: `${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}`,
          growth_rate: candidate.growthRate,
          total_leaked_bytes: candidate.totalLeakedSize,
          retainer_chains: candidate.retainerChains.map(c =>
            c.chain.map(s => `${s.nodeName}.${s.edgeName}`).join(' → ')
          ),
        },
        cname: color,
      });

      offset += dur + 100_000;
    }
  }

  private addAllocationBreakdown(report: LeakReport, startTs: number): void {
    const allocTid = this.tid + 4;

    this.events.push({
      pid: this.pid,
      tid: allocTid,
      ts: 0,
      ph: 'M',
      name: 'thread_name',
      args: { name: 'Allocations' },
    });

    let offset = 0;
    for (const candidate of report.leakCandidates) {
      const countPerSnapshot = [
        candidate.countInSnapshot1,
        candidate.countInSnapshot2,
        candidate.countInSnapshot3,
      ];

      for (let s = 0; s < 3; s++) {
        const dur = Math.max(countPerSnapshot[s] * 1000, 10000);
        this.events.push({
          pid: this.pid,
          tid: allocTid,
          ts: startTs + offset + s * this.snapshotInterval,
          ph: 'X',
          name: `${candidate.className} (×${countPerSnapshot[s]})`,
          cat: 'allocation',
          dur,
          args: {
            snapshot: s + 1,
            count: countPerSnapshot[s],
            class: candidate.className,
          },
          cname: s === 0 ? COLORS.allocation : COLORS.growth,
        });
      }

      offset += 500_000;
    }
  }

  // ─── Serialization ──────────────────────────────────────────────────────

  /** Get all accumulated trace events */
  getEvents(): TraceEvent[] {
    return this.events;
  }

  /** Serialize to JSON string (ready for file output) */
  toJSON(): string {
    const trace: PerfettoTrace = {
      traceEvents: this.events,
      displayTimeUnit: 'ms',
    };
    return JSON.stringify(trace, null, 2);
  }

  /** Serialize to compact JSON (smaller file size) */
  toCompactJSON(): string {
    const trace: PerfettoTrace = {
      traceEvents: this.events,
      displayTimeUnit: 'ms',
    };
    return JSON.stringify(trace);
  }
}

// ─── V8 CPU Profile Types ────────────────────────────────────────────────────

export interface V8CpuProfile {
  nodes: V8CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface V8CpuProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
}
