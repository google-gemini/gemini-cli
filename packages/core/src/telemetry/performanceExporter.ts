/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PerformanceSummary } from './performanceCollector.js';

/**
 * Options controlling which sections appear in the exported report.
 */
export interface ExportOptions {
  includeLatency?: boolean;
  includeTokens?: boolean;
  includeMemory?: boolean;
  includeStartup?: boolean;
  includeSuggestions?: boolean;
}

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  includeLatency: true,
  includeTokens: true,
  includeMemory: true,
  includeStartup: true,
  includeSuggestions: true,
};

/**
 * Formats a duration in milliseconds into a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Exports a PerformanceSummary as a JSON string for CI pipelines.
 */
export function exportToJSON(
  summary: PerformanceSummary,
  opts?: ExportOptions,
): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const output: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    sessionDurationMs: summary.sessionDurationMs,
    apiWaitMs: summary.apiWaitMs,
    toolExecMs: summary.toolExecMs,
  };

  if (options.includeLatency) {
    output['latencyByModel'] = summary.latencyByModel;
  }
  if (options.includeTokens) {
    output['tokenEfficiency'] = summary.tokenEfficiency;
  }
  if (options.includeMemory) {
    output['memory'] = {
      currentMB: summary.memoryCurrentMB,
      peakMB: summary.memoryPeakMB,
      heapUtilization: summary.heapUtilization,
      trendPoints: summary.memoryTrend.length,
    };
  }
  if (options.includeStartup) {
    output['startup'] = {
      totalMs: summary.startupTotalMs,
      phases: summary.startupPhases,
    };
  }
  if (options.includeSuggestions) {
    output['suggestions'] = summary.suggestions;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Exports a PerformanceSummary as a Markdown report for human-readable sharing.
 */
export function exportToMarkdown(
  summary: PerformanceSummary,
  opts?: ExportOptions,
): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const lines: string[] = [];

  lines.push('# Performance Report');
  lines.push('');
  lines.push(
    `**Session Duration:** ${formatDuration(summary.sessionDurationMs)}`,
  );
  lines.push(`**API Wait Time:** ${formatDuration(summary.apiWaitMs)}`);
  lines.push(`**Tool Execution Time:** ${formatDuration(summary.toolExecMs)}`);
  lines.push('');

  if (options.includeLatency && summary.latencyByModel.length > 0) {
    lines.push('## Latency by Model');
    lines.push('');
    lines.push('| Model | P50 | P90 | P99 | Samples |');
    lines.push('|-------|-----|-----|-----|---------|');
    for (const m of summary.latencyByModel) {
      lines.push(
        `| ${m.model} | ${formatDuration(m.p50)} | ${formatDuration(m.p90)} | ${formatDuration(m.p99)} | ${m.sampleCount} |`,
      );
    }
    lines.push('');
  }

  if (options.includeTokens) {
    const te = summary.tokenEfficiency;
    lines.push('## Token Efficiency');
    lines.push('');
    lines.push(`- **Cache Hit Rate:** ${(te.cacheHitRate * 100).toFixed(1)}%`);
    lines.push(
      `- **Output Efficiency:** ${(te.outputEfficiency * 100).toFixed(1)}%`,
    );
    lines.push(
      `- **Context Utilization:** ${(te.contextUtilization * 100).toFixed(1)}%`,
    );
    lines.push(
      `- **Total:** ${te.totalInput.toLocaleString()} input / ${te.totalOutput.toLocaleString()} output / ${te.totalCached.toLocaleString()} cached`,
    );
    lines.push('');
  }

  if (options.includeMemory) {
    lines.push('## Memory');
    lines.push('');
    lines.push(`- **Current:** ${summary.memoryCurrentMB} MB`);
    lines.push(`- **Peak:** ${summary.memoryPeakMB} MB`);
    lines.push(
      `- **Heap Utilization:** ${(summary.heapUtilization * 100).toFixed(1)}%`,
    );
    lines.push('');
  }

  if (options.includeStartup && summary.startupPhases.length > 0) {
    lines.push('## Startup');
    lines.push('');
    lines.push(`**Total:** ${formatDuration(summary.startupTotalMs)}`);
    lines.push('');
    lines.push('| Phase | Duration | % |');
    lines.push('|-------|----------|---|');
    for (const p of summary.startupPhases) {
      lines.push(
        `| ${p.name} | ${formatDuration(p.durationMs)} | ${p.percentage.toFixed(1)}% |`,
      );
    }
    lines.push('');
  }

  if (options.includeSuggestions && summary.suggestions.length > 0) {
    lines.push('## Suggestions');
    lines.push('');
    for (const s of summary.suggestions) {
      const icon =
        s.severity === 'critical'
          ? '🔴'
          : s.severity === 'warning'
            ? '🟡'
            : 'ℹ️';
      lines.push(`- ${icon} **[${s.category}]** ${s.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
