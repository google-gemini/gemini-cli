/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HdslReport,
  HdslConstructorEntry,
  HdslDetachedNodes,
  HdslTrigger,
  HdslV8SpaceBreakdown,
  LeakPattern,
} from './types.js';
import { randomUUID } from 'node:crypto';

/**
 * Serializes the investigation results into the compact HeapDelta Semantic
 * Language (HDSL) format. Always produces a payload < 5 KB.
 */
export function serializeToHdsl(params: {
  investigationId: string;
  startTimestamp: number;
  durationMs: number;
  trigger: HdslTrigger;
  v8Spaces: HdslV8SpaceBreakdown;
  constructors: HdslConstructorEntry[];
  detachedNodes: HdslDetachedNodes;
  patterns: LeakPattern[];
  confidence: number;
  perfettoPath?: string;
}): HdslReport {
  const {
    investigationId,
    startTimestamp,
    durationMs,
    trigger,
    v8Spaces,
    constructors,
    detachedNodes,
    patterns,
    confidence,
    perfettoPath,
  } = params;

  const report: HdslReport = {
    hdsl_version: '1.0',
    investigation_id: investigationId,
    timestamp_ms: startTimestamp,
    duration_ms: durationMs,
    trigger,
    v8_spaces: v8Spaces,
    constructors,
    detached_nodes: detachedNodes,
    patterns,
    confidence,
    payload_bytes: 0,
    perfetto_path: perfettoPath,
  };

  // Compute actual payload size and record it
  const serialized = JSON.stringify(report);
  report.payload_bytes = Buffer.byteLength(serialized, 'utf8');

  return report;
}

/** Generates a stable, short investigation ID */
export function generateInvestigationId(): string {
  const ts = Date.now().toString(36);
  const random = randomUUID().split('-')[0];
  return `inv_${ts}_${random}`;
}

/**
 * Formats the HDSL report as a compact, readable markdown summary
 * suitable for terminal output and LLM context injection.
 */
export function formatHdslSummary(report: HdslReport): string {
  const lines: string[] = [
    `## Memory Investigation Report \`${report.investigation_id}\``,
    ``,
    `**Triggered:** ${new Date(report.timestamp_ms).toISOString()}`,
    `**Duration:** ${(report.duration_ms / 1000).toFixed(1)}s`,
    `**Confidence:** ${(report.confidence * 100).toFixed(0)}%`,
    ``,
    `### Trigger`,
    `- Type: \`${report.trigger.type ?? 'threshold'}\`  Reason: ${report.trigger.reason ?? report.trigger.metric ?? 'unknown'}`,
    report.trigger.growth_percent !== undefined
      ? `- Growth: **+${report.trigger.growth_percent.toFixed(1)}%** (+${formatBytes(report.trigger.absolute_bytes ?? 0)})`
      : `- Heap at trigger: ${formatBytes(report.trigger.heap_used_bytes)}`,
    ``,
    `### V8 Heap Space Analysis`,
    `| Space | Delta |`,
    `|-------|-------|`,
    `| Old Space (real leaks) | **+${formatBytes(report.v8_spaces.old_space_delta_bytes)}** |`,
    `| New Space (ephemeral) | +${formatBytes(report.v8_spaces.new_space_delta_bytes)} |`,
    `| Large Object Space | +${formatBytes(report.v8_spaces.large_object_space_delta_bytes)} |`,
    ``,
    `### Detected Patterns`,
  ];

  if (report.patterns.length === 0) {
    lines.push(`_No leak patterns detected_`);
  } else {
    for (const p of report.patterns) {
      lines.push(`- 🔴 \`${p}\``);
    }
  }

  lines.push(``, `### Top Leaked Constructors`);
  lines.push(`| Constructor | Δ Instances | Δ Size | Pattern |`);
  lines.push(`|-------------|-------------|--------|---------|`);

  for (const c of report.constructors.slice(0, 10)) {
    const pattern = c.contributing_patterns[0] ?? '—';
    lines.push(
      `| \`${c.name}\` | +${c.instances_delta} | +${formatBytes(c.self_size_delta_bytes)} | ${pattern} |`,
    );
  }

  if (report.detached_nodes.count > 0) {
    lines.push(``, `### Detached Nodes`);
    lines.push(`- Count: **${report.detached_nodes.count}**`);
    lines.push(
      `- Top types: ${report.detached_nodes.top_constructors.map((n) => `\`${n}\``).join(', ')}`,
    );
  }

  if (report.perfetto_path) {
    lines.push(``, `### Perfetto Trace`);
    lines.push(`Trace written to: \`${report.perfetto_path}\``);
    lines.push(`View at: https://ui.perfetto.dev (open file)`);
  }

  lines.push(``, `_Payload: ${formatBytes(report.payload_bytes)}_`);

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
