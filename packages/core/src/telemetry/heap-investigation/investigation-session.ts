/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as inspector from 'node:inspector';
import * as v8 from 'node:v8';
import * as os from 'node:os';
import { parseHeapSnapshot } from './heap-parser.js';
import {
  diffSnapshots,
  analyzeDetachedNodes,
  detectLeakPatterns,
  buildHdslConstructorEntries,
  calculateConfidence,
  collectAllPatterns,
  scanSensitiveStrings,
} from './pattern-detector.js';
import {
  serializeToHdsl,
  generateInvestigationId,
  formatHdslSummary,
} from './hdsl-serializer.js';
import { PerfettoEmitter } from './perfetto-emitter.js';
import { SnapshotCaptureError } from './errors.js';
import type {
  HdslReport,
  InvestigationOptions,
  InvestigationPhase,
  InvestigationProgress,
  ParsedHeapSnapshot,
  HdslTrigger,
  HdslV8SpaceBreakdown,
} from './types.js';

const DEFAULT_OPTIONS: Required<InvestigationOptions> = {
  phase_interval_ms: 30_000,
  max_constructor_entries: 20,
  min_delta_bytes: 1_000_000,
  output_dir: os.tmpdir(),
  emit_perfetto: true,
};

export type ProgressCallback = (progress: InvestigationProgress) => void;

/**
 * The 3-phase heap investigation session.
 *
 * Phase 1 (T+0): Baseline snapshot
 * Phase 2 (T+interval): Workload snapshot (after user activity)
 * Phase 3 (T+interval*2): Stabilization snapshot (after forced GC)
 *
 * Produces a compact HDSL report with leak patterns and Perfetto trace.
 */
export class HeapInvestigationSession {
  private readonly id: string;
  private readonly options: Required<InvestigationOptions>;
  private readonly perfetto: PerfettoEmitter;
  private phase: InvestigationPhase = 'idle';
  private startTime: number = 0;
  private aborted = false;

  constructor(
    private readonly trigger: HdslTrigger,
    options: InvestigationOptions = {},
    private readonly onProgress?: ProgressCallback,
  ) {
    this.id = generateInvestigationId();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.perfetto = new PerfettoEmitter(this.options.output_dir);
  }

  get investigationId(): string {
    return this.id;
  }

  /** Gets the current investigation phase */
  get currentPhase(): InvestigationPhase {
    return this.phase;
  }

  /** Aborts the current investigation */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Runs the full 3-phase investigation and returns the HDSL report.
   */
  async run(): Promise<HdslReport> {
    this.startTime = Date.now();
    this.phase = 'baseline';

    this.emitProgress({
      phase: 'baseline',
      phase_index: 0,
      total_phases: 3,
      message: 'Capturing baseline heap snapshot (S1)...',
      elapsed_ms: 0,
    });

    // Phase 1: Baseline
    const s1Raw = await this.captureSnapshot('s1_baseline');
    if (this.aborted) return this.abortedReport();

    const s1 = await parseHeapSnapshot(s1Raw, `${this.id}_s1`);

    // Snapshot baseline V8 space stats
    const spaces1 = await this.getHeapSpaceStats();

    await this.delay(this.options.phase_interval_ms);
    if (this.aborted) return this.abortedReport();

    // Phase 2: Workload
    this.phase = 'workload';
    this.emitProgress({
      phase: 'workload',
      phase_index: 1,
      total_phases: 3,
      message: 'Capturing workload snapshot (S2)...',
      elapsed_ms: Date.now() - this.startTime,
    });

    const s2Raw = await this.captureSnapshot('s2_workload');
    if (this.aborted) return this.abortedReport();
    const s2 = await parseHeapSnapshot(s2Raw, `${this.id}_s2`);

    await this.delay(this.options.phase_interval_ms);
    if (this.aborted) return this.abortedReport();

    // Phase 3: Post-GC stabilization
    this.phase = 'stabilizing';
    this.emitProgress({
      phase: 'stabilizing',
      phase_index: 2,
      total_phases: 3,
      message: 'Forcing GC and capturing stabilization snapshot (S3)...',
      elapsed_ms: Date.now() - this.startTime,
    });

    // Request GC before final snapshot to filter ephemeral objects
    this.requestGc();
    await this.delay(500); // brief pause for GC to complete

    const s3Raw = await this.captureSnapshot('s3_stabilize');
    if (this.aborted) return this.abortedReport();
    const s3 = await parseHeapSnapshot(s3Raw, `${this.id}_s3`);

    const spaces3 = await this.getHeapSpaceStats();

    // Analysis phase
    this.phase = 'analyzing';
    this.emitProgress({
      phase: 'analyzing',
      phase_index: 3,
      total_phases: 3,
      message: 'Analyzing leak patterns with Dominator Tree...',
      elapsed_ms: Date.now() - this.startTime,
    });

    const report = await this.analyze(s1, s2, s3, spaces1, spaces3);

    // Emit Perfetto trace
    let perfettoPath: string | undefined;
    if (this.options.emit_perfetto) {
      this.perfetto.recordHdslReport(report);
      perfettoPath = await this.perfetto.flush(this.id);
    }

    const finalReport: HdslReport = { ...report, perfetto_path: perfettoPath };

    this.phase = 'complete';
    this.emitProgress({
      phase: 'complete',
      phase_index: 4,
      total_phases: 3,
      message: `Investigation complete. Confidence: ${(finalReport.confidence * 100).toFixed(0)}%`,
      elapsed_ms: Date.now() - this.startTime,
    });

    return finalReport;
  }

  /** Core analysis: diff → pattern detection → dominator paths → HDSL */
  private async analyze(
    s1: ParsedHeapSnapshot,
    s2: ParsedHeapSnapshot,
    s3: ParsedHeapSnapshot,
    spaces1: v8.HeapSpaceInfo[],
    spaces3: v8.HeapSpaceInfo[],
  ): Promise<HdslReport> {
    // 3-snapshot diff
    const diff = diffSnapshots(s1, s2, s3);

    // Detached node analysis
    const detachedNodes = analyzeDetachedNodes(s3);

    // Pattern detection
    const patterns = detectLeakPatterns(diff, detachedNodes);

    // Build HDSL constructor entries with real BFS retainer chain walk
    // The optional 5th argument (s3 snapshot) enables walkRetainerChain()
    const constructors = buildHdslConstructorEntries(
      diff,
      patterns,
      new Map(), // dominator paths computed in worker in production
      this.options.max_constructor_entries,
      s3, // enables real BFS walk on the post-GC snapshot
    );

    // V8 space breakdown
    const v8Spaces = this.buildSpaceBreakdown(spaces1, spaces3);

    // Sensitive string scan (security concern raised in issue thread)
    const sensitiveStrings = scanSensitiveStrings(s3);
    if (sensitiveStrings.total_flagged > 0) {
      // Emit a sanitized count — never log the actual strings
      this.emitProgress({
        phase: 'analyzing',
        phase_index: 3,
        total_phases: 3,
        message:
          `⚠️  Sensitive string scan: ${sensitiveStrings.total_flagged} credential pattern(s) found in heap. ` +
          `API keys: ${sensitiveStrings.api_key_pattern_count}, ` +
          `Passwords: ${sensitiveStrings.password_field_count}, ` +
          `Tokens: ${sensitiveStrings.token_pattern_count}`,
        elapsed_ms: Date.now() - this.startTime,
      });
    }

    // Confidence score
    const allPatterns = collectAllPatterns(patterns);
    const confidence = calculateConfidence(
      patterns,
      v8Spaces.old_space_delta_bytes,
      v8Spaces.total_heap_delta_bytes,
    );

    return serializeToHdsl({
      investigationId: this.id,
      startTimestamp: this.startTime,
      durationMs: Date.now() - this.startTime,
      trigger: this.trigger,
      v8Spaces,
      constructors,
      detachedNodes,
      patterns: allPatterns,
      confidence,
    });
  }

  /** Computes V8 heap space deltas between two getHeapSpaceStatistics() reads */
  private buildSpaceBreakdown(
    spaces1: v8.HeapSpaceInfo[],
    spaces3: v8.HeapSpaceInfo[],
  ): HdslV8SpaceBreakdown {
    const s1Map = new Map(
      spaces1.map((s) => [s.space_name, s.space_used_size]),
    );
    const s3Map = new Map(
      spaces3.map((s) => [s.space_name, s.space_used_size]),
    );

    const delta = (name: string) =>
      (s3Map.get(name) ?? 0) - (s1Map.get(name) ?? 0);

    const oldSpaceDelta =
      delta('old_space') + delta('map_space') + delta('code_space');
    const newSpaceDelta = delta('new_space');
    const largeObjectDelta = delta('large_object_space') + delta('lo_space');
    const codeDelta = delta('code_space');
    const totalDelta = [...s3Map.entries()]
      .map(([k, v]) => v - (s1Map.get(k) ?? 0))
      .reduce((a, b) => a + b, 0);

    return {
      old_space_delta_bytes: Math.max(0, oldSpaceDelta),
      new_space_delta_bytes: Math.max(0, newSpaceDelta),
      code_space_delta_bytes: Math.max(0, codeDelta),
      large_object_space_delta_bytes: Math.max(0, largeObjectDelta),
      total_heap_delta_bytes: Math.max(0, totalDelta),
    };
  }

  /**
   * Captures a heap snapshot using the node:inspector Session API.
   * Returns raw JSON string of the snapshot.
   */
  private async captureSnapshot(label: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const session = new inspector.Session();
      const chunks: string[] = [];

      session.connect();

      session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
        chunks.push(m.params.chunk);
      });

      session.post('HeapProfiler.enable', () => {
        session.post(
          'HeapProfiler.takeHeapSnapshot',
          { reportProgress: false, treatGlobalObjectsAsRoots: true },
          (err) => {
            session.disconnect();
            if (err) {
              reject(
                new SnapshotCaptureError(
                  `Failed to capture snapshot "${label}"`,
                  err,
                ),
              );
              return;
            }
            resolve(chunks.join(''));
          },
        );
      });
    });
  }

  /** Gets V8 heap space statistics */
  private async getHeapSpaceStats(): Promise<v8.HeapSpaceInfo[]> {
    return v8.getHeapSpaceStatistics();
  }

  private requestGc(): void {
    try {
      // @ts-ignore
      if (typeof globalThis.gc === 'function') {
        // @ts-ignore
        globalThis.gc();
      }
    } catch {
      // GC not available, continue without it
    }
  }

  private emitProgress(progress: InvestigationProgress): void {
    this.perfetto.recordInvestigationPhase(progress);
    this.onProgress?.(progress);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }

  private abortedReport(): HdslReport {
    return serializeToHdsl({
      investigationId: this.id,
      startTimestamp: this.startTime,
      durationMs: Date.now() - this.startTime,
      trigger: this.trigger,
      v8Spaces: {
        old_space_delta_bytes: 0,
        new_space_delta_bytes: 0,
        code_space_delta_bytes: 0,
        large_object_space_delta_bytes: 0,
        total_heap_delta_bytes: 0,
      },
      constructors: [],
      detachedNodes: {
        count: 0,
        top_constructors: [],
        detachedness_source: 'v8_detachedness_field',
      },
      patterns: [],
      confidence: 0,
    });
  }
}

/** Convenience function: run a one-shot investigation */
export async function runHeapInvestigation(
  trigger: HdslTrigger,
  options?: InvestigationOptions,
  onProgress?: ProgressCallback,
): Promise<{ report: HdslReport; summary: string }> {
  const session = new HeapInvestigationSession(trigger, options, onProgress);
  const report = await session.run();
  const summary = formatHdslSummary(report);
  return { report, summary };
}
