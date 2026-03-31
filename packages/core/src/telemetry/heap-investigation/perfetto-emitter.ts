/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PerfettoEvent,
  HdslReport,
  InvestigationProgress,
} from './types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PathTraversalError } from './errors.js';

/** Safe base directories for Perfetto trace output */
const SAFE_OUTPUT_BASES = [os.tmpdir(), os.homedir()];

/**
 * Validates that an output path is within a safe directory.
 * Prevents path traversal attacks.
 */
function validateOutputPath(outputPath: string): void {
  const resolved = path.resolve(outputPath);
  const isSafe = SAFE_OUTPUT_BASES.some((base) => {
    const resolvedBase = path.resolve(base);
    return (
      resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase
    );
  });
  if (!isSafe) {
    throw new PathTraversalError(outputPath);
  }
}

/**
 * Emits investigation results as a Perfetto-compatible Chrome Trace Event JSON file.
 * Includes agent-turn annotations as "flow" events linking to memory events.
 */
export class PerfettoEmitter {
  private events: PerfettoEvent[] = [];
  private readonly pid: number;
  private readonly tid = 1;

  constructor(private readonly outputDir: string = os.tmpdir()) {
    this.pid = process.pid;
    validateOutputPath(outputDir);
  }

  /**
   * Records an agent turn begin event.
   * Called from DiagnosticBridge when an agent turn starts.
   */
  recordAgentTurnBegin(
    turnNumber: number,
    modelId: string,
    toolNames: string[],
    timestampMs: number = Date.now(),
  ): string {
    const flowId = `turn_${turnNumber}`;
    this.events.push({
      ph: 'B',
      ts: timestampMs * 1000, // Perfetto uses microseconds
      pid: this.pid,
      tid: this.tid,
      name: `agent_turn_${turnNumber}`,
      cat: 'agent',
      args: {
        turn: turnNumber,
        model: modelId,
        tools: toolNames.join(','),
      },
    });
    return flowId;
  }

  /**
   * Records an agent turn end event.
   */
  recordAgentTurnEnd(
    turnNumber: number,
    timestampMs: number = Date.now(),
  ): void {
    this.events.push({
      ph: 'E',
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: this.tid,
      name: `agent_turn_${turnNumber}`,
      cat: 'agent',
    });
  }

  /**
   * Records a memory counter event (heap usage over time).
   */
  recordMemoryCounter(
    heapUsedBytes: number,
    rssBytes: number,
    timestampMs: number = Date.now(),
  ): void {
    this.events.push({
      ph: 'C',
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: this.tid,
      name: 'memory',
      args: {
        heap_used_mb: Math.round(heapUsedBytes / (1024 * 1024)),
        rss_mb: Math.round(rssBytes / (1024 * 1024)),
      },
    });
  }

  /**
   * Records a memory threshold event — the beginning of a flow that links
   * this memory spike back to the causative agent turn.
   */
  recordThresholdExceeded(
    metricType: string,
    growthPercent: number,
    causativeTurnNumber: number,
    timestampMs: number = Date.now(),
  ): void {
    const flowId = `threshold_${timestampMs}`;

    // Instant event marking the threshold
    this.events.push({
      ph: 'i',
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: this.tid,
      name: `threshold_exceeded`,
      cat: 'memory',
      args: {
        metric: metricType,
        growth_percent: growthPercent,
        caused_by_turn: causativeTurnNumber,
      },
    });

    // Flow start: from memory threshold
    this.events.push({
      ph: 's',
      id: flowId,
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: this.tid,
      name: 'memory_to_agent_turn',
      cat: 'flow',
    });

    // Flow end: to agent turn
    this.events.push({
      ph: 'f',
      id: flowId,
      bp: 'e',
      ts: (timestampMs - 1) * 1000, // slightly before to keep flows valid
      pid: this.pid,
      tid: this.tid,
      name: 'memory_to_agent_turn',
      cat: 'flow',
    });
  }

  /**
   * Records the investigation progress as a slice event.
   */
  recordInvestigationPhase(
    progress: InvestigationProgress,
    timestampMs: number = Date.now(),
  ): void {
    const isBegin = progress.phase !== 'complete' && progress.phase !== 'error';
    this.events.push({
      ph: isBegin ? 'B' : 'E',
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: 2, // investigation runs on separate tid
      name: `investigation_${progress.phase}`,
      cat: 'investigation',
      args: {
        phase: progress.phase,
        message: progress.message,
        elapsed_ms: progress.elapsed_ms,
      },
    });
  }

  /**
   * Embeds the full HDSL report as an annotation at the end of the trace.
   */
  recordHdslReport(report: HdslReport, timestampMs: number = Date.now()): void {
    this.events.push({
      ph: 'i',
      ts: timestampMs * 1000,
      pid: this.pid,
      tid: 2,
      name: 'hdsl_report',
      cat: 'investigation',
      args: {
        investigation_id: report.investigation_id,
        confidence: report.confidence,
        patterns: report.patterns.join(','),
        old_space_delta_mb: Math.round(
          report.v8_spaces.old_space_delta_bytes / (1024 * 1024),
        ),
        top_constructor: report.constructors[0]?.name ?? 'none',
        detached_nodes: report.detached_nodes.count,
      },
    });
  }

  /**
   * Writes the collected events to a Perfetto JSON file.
   * Returns the path of the written file.
   */
  async flush(investigationId: string): Promise<string> {
    const filename = `gemini-cli-${investigationId}.perfetto.json`;
    const outputPath = path.join(this.outputDir, filename);

    validateOutputPath(outputPath);

    const traceData = JSON.stringify(this.events, null, 0);
    await fs.writeFile(outputPath, traceData, 'utf8');

    return outputPath;
  }

  /** Returns current event count for diagnostics */
  getEventCount(): number {
    return this.events.length;
  }

  /** Clears all recorded events */
  reset(): void {
    this.events = [];
  }
}
