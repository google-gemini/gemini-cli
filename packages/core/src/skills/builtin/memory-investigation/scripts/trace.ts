/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * trace.ts — Chrome JSON Trace Event Converter
 *
 * Converts heap diff analysis results into Chrome JSON Trace Event format,
 * directly compatible with ui.perfetto.dev and chrome://tracing.
 *
 * Zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DiffSummary, TraceEvent, TraceOptions, TraceOutput } from './types.js';

/**
 * Convert heap diff summary to Chrome JSON Trace Event format.
 */
export function convertToTraceEvents(
  diffSummary: DiffSummary,
  options: TraceOptions = {},
): TraceOutput {
  const {
    processName = 'heapsnapshot-poc',
    pid = 1,
    tid = 1,
  } = options;

  const events: TraceEvent[] = [];

  // Extract timing info from diff summary
  const snapshotCount = diffSummary.snapshots?.count || 3;
  const intervalMs = diffSummary.snapshots?.intervalMs || 5000;
  const baseTimestamp = new Date(diffSummary.timestamp).getTime() * 1000; // to microseconds
  const totalDurationUs = intervalMs * (snapshotCount - 1) * 1000; // to microseconds

  // ── Metadata Events ──
  events.push({
    ph: 'M',
    pid,
    tid,
    name: 'process_name',
    args: { name: processName },
  });

  events.push({
    ph: 'M',
    pid,
    tid,
    name: 'thread_name',
    args: { name: 'HeapAnalysis' },
  });

  // ── Snapshot Capture Instant Events ──
  for (let i = 0; i < snapshotCount; i++) {
    const snapshotTs = baseTimestamp + (i * intervalMs * 1000);
    events.push({
      ph: 'i',
      pid,
      tid,
      ts: snapshotTs,
      name: `Snapshot ${i}`,
      cat: 'heap_capture',
      s: 'g', // global scope
      args: {
        snapshot_index: i,
        path: diffSummary.snapshots?.paths?.[i] || `snapshot_${i}.heapsnapshot`,
      },
    });
  }

  // ── Anomaly Duration Events ──
  const anomalies = diffSummary.anomalies || [];

  for (let i = 0; i < anomalies.length; i++) {
    const anomaly = anomalies[i];
    const anomalyTid = tid + i + 1;

    // Thread name metadata for this anomaly
    events.push({
      ph: 'M',
      pid,
      tid: anomalyTid,
      name: 'thread_name',
      args: { name: `Leak #${i + 1}: ${anomaly.name}` },
    });

    // Complete event spanning the analysis window
    events.push({
      ph: 'X',
      pid,
      tid: anomalyTid,
      ts: baseTimestamp,
      dur: totalDurationUs,
      name: anomaly.name,
      cat: 'heap_analysis',
      args: {
        size_delta_bytes: anomaly.sizeDelta,
        size_delta_human: formatBytes(anomaly.sizeDelta),
        count_delta: anomaly.countDelta,
        current_size_bytes: anomaly.currentSize,
        current_count: anomaly.currentCount,
        node_type: anomaly.nodeType || 'unknown',
        rank: i + 1,
      },
    });
  }

  // ── Counter Events (heap growth over time) ──
  const totalGrowth = anomalies.reduce((sum, a) => sum + Math.max(0, a.sizeDelta), 0);

  for (let i = 0; i < snapshotCount; i++) {
    const snapshotTs = baseTimestamp + (i * intervalMs * 1000);
    const growthFraction = i / (snapshotCount - 1);

    events.push({
      ph: 'C',
      pid,
      tid,
      ts: snapshotTs,
      name: 'Heap Growth',
      cat: 'memory',
      args: {
        'Total Growth (bytes)': Math.round(totalGrowth * growthFraction),
        'Anomaly Count': Math.round(anomalies.length * growthFraction),
      },
    });
  }

  // Return in Chrome trace format
  return {
    traceEvents: events,
    metadata: {
      tool: 'heapsnapshot-poc',
      version: '0.1.0',
      source: 'GSoC 2026 Issue #23365',
      node_version: diffSummary.nodeVersion,
      v8_version: diffSummary.v8Version,
      snapshot_count: snapshotCount,
      interval_ms: intervalMs,
    },
  };
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes >= 0 ? '+' : '-';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Run as standalone CLI tool.
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node trace.js <diff_summary.json> [--output trace.json]');
    process.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | null = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  // Default output path
  if (!outputPath) {
    const dir = path.dirname(inputPath);
    outputPath = path.join(dir, 'trace.json');
  }

  // Read diff summary
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Cannot read file: ${inputPath} (file not found)`);
    process.exit(1);
  }

  const diffSummary: DiffSummary = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  // Convert to trace events
  const traceData = convertToTraceEvents(diffSummary);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(traceData, null, 2));

  const eventCount = traceData.traceEvents.length;
  console.log(`Converted ${eventCount} trace events -> ${path.resolve(outputPath)}`);
  console.log(`Open in: https://ui.perfetto.dev/ (drag and drop the trace.json file)`);
}

// Run as CLI if executed directly
const scriptPath = process.argv[1];
const modulePath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
if (scriptPath && path.resolve(scriptPath) === path.resolve(modulePath)) {
  main();
}
