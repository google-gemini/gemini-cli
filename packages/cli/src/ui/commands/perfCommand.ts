/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import type { HistoryItemPerfDashboard } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

/**
 * Collects a performance snapshot from the current session context.
 * This aggregates metrics from the session's models and tools into
 * a single PerfSnapshot object for the dashboard to display.
 */
function collectPerfSnapshot(context: CommandContext) {
  const { stats } = context.session;
  const { metrics } = stats;
  const now = new Date();
  const uptimeMs = now.getTime() - stats.sessionStartTime.getTime();

  // Aggregate tool performance by name
  const toolPerf: Array<{
    name: string;
    calls: number;
    avgMs: number;
    totalMs: number;
    successRate: number;
  }> = [];

  for (const [name, toolStats] of Object.entries(metrics.tools.byName)) {
    const avgMs = toolStats.count > 0 ? toolStats.durationMs / toolStats.count : 0;
    const successRate = toolStats.count > 0 ? (toolStats.success / toolStats.count) * 100 : 0;
    toolPerf.push({
      name,
      calls: toolStats.count,
      avgMs: Math.round(avgMs),
      totalMs: Math.round(toolStats.durationMs),
      successRate,
    });
  }

  // Sort tools by total time descending
  toolPerf.sort((a, b) => b.totalMs - a.totalMs);

  // Aggregate API performance by model
  const apiPerf: Array<{
    model: string;
    requests: number;
    avgLatencyMs: number;
    totalLatencyMs: number;
    errorRate: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }> = [];

  for (const [model, modelMetrics] of Object.entries(metrics.models)) {
    const avgLatency = modelMetrics.api.totalRequests > 0
      ? modelMetrics.api.totalLatencyMs / modelMetrics.api.totalRequests
      : 0;
    const errorRate = modelMetrics.api.totalRequests > 0
      ? (modelMetrics.api.totalErrors / modelMetrics.api.totalRequests) * 100
      : 0;
    apiPerf.push({
      model: model.replace('-001', ''),
      requests: modelMetrics.api.totalRequests,
      avgLatencyMs: Math.round(avgLatency),
      totalLatencyMs: Math.round(modelMetrics.api.totalLatencyMs),
      errorRate,
      inputTokens: modelMetrics.tokens.input,
      outputTokens: modelMetrics.tokens.candidates,
      cachedTokens: modelMetrics.tokens.cached,
    });
  }

  // Memory snapshot
  const memUsage = process.memoryUsage();
  const memory = {
    heapUsedMB: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMB: Math.round((memUsage.heapTotal / 1024 / 1024) * 10) / 10,
    rssMB: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
    externalMB: Math.round((memUsage.external / 1024 / 1024) * 10) / 10,
  };

  // Memory warnings
  const memoryWarnings: string[] = [];
  const heapPercent = memUsage.heapUsed / memUsage.heapTotal;
  if (heapPercent > 0.9) {
    memoryWarnings.push('Critical: Heap usage above 90%!');
  } else if (heapPercent > 0.75) {
    memoryWarnings.push('Warning: Heap usage above 75%');
  }
  if (memUsage.rss > 512 * 1024 * 1024) {
    memoryWarnings.push('Warning: RSS memory exceeds 512MB');
  }

  // Total token counts
  const totalInputTokens = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.tokens.input, 0,
  );
  const totalOutputTokens = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.tokens.candidates, 0,
  );
  const totalCachedTokens = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.tokens.cached, 0,
  );

  // Total API time and tool time
  const totalApiTime = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.api.totalLatencyMs, 0,
  );
  const totalToolTime = metrics.tools.totalDurationMs;

  return {
    uptimeMs,
    duration: formatDuration(uptimeMs),
    memory,
    memoryWarnings,
    toolPerf,
    apiPerf,
    totalToolCalls: metrics.tools.totalCalls,
    totalToolTime,
    totalApiRequests: Object.values(metrics.models).reduce(
      (acc, m) => acc + m.api.totalRequests, 0,
    ),
    totalApiTime,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalLinesAdded: metrics.files.totalLinesAdded,
    totalLinesRemoved: metrics.files.totalLinesRemoved,
  };
}

export const perfCommand: SlashCommand = {
  name: 'perf',
  altNames: ['performance'],
  description: 'Performance monitoring dashboard. Usage: /perf [overview|memory|tools|api]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  action: async (context: CommandContext) => {
    const snapshot = collectPerfSnapshot(context);
    context.ui.addItem({
      type: MessageType.PERF_DASHBOARD,
      view: 'overview',
      snapshot,
    } as HistoryItemPerfDashboard);
  },
  subCommands: [
    {
      name: 'overview',
      description: 'Show performance overview dashboard',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        context.ui.addItem({
          type: MessageType.PERF_DASHBOARD,
          view: 'overview',
          snapshot,
        } as HistoryItemPerfDashboard);
      },
    },
    {
      name: 'memory',
      description: 'Show detailed memory usage and warnings',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        context.ui.addItem({
          type: MessageType.PERF_DASHBOARD,
          view: 'memory',
          snapshot,
        } as HistoryItemPerfDashboard);
      },
    },
    {
      name: 'tools',
      description: 'Show tool execution timing and frequency',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        context.ui.addItem({
          type: MessageType.PERF_DASHBOARD,
          view: 'tools',
          snapshot,
        } as HistoryItemPerfDashboard);
      },
    },
    {
      name: 'api',
      description: 'Show model API latency breakdown',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        context.ui.addItem({
          type: MessageType.PERF_DASHBOARD,
          view: 'api',
          snapshot,
        } as HistoryItemPerfDashboard);
      },
    },
    {
      name: 'export',
      description: 'Export performance report as JSON',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        const report = JSON.stringify({
          timestamp: new Date().toISOString(),
          session_id: context.session.stats.sessionId,
          uptime_ms: snapshot.uptimeMs,
          memory: snapshot.memory,
          tools: {
            total_calls: snapshot.totalToolCalls,
            total_time_ms: snapshot.totalToolTime,
            by_tool: snapshot.toolPerf,
          },
          api: {
            total_requests: snapshot.totalApiRequests,
            total_time_ms: snapshot.totalApiTime,
            by_model: snapshot.apiPerf,
          },
          tokens: {
            input: snapshot.totalInputTokens,
            output: snapshot.totalOutputTokens,
            cached: snapshot.totalCachedTokens,
          },
          files: {
            lines_added: snapshot.totalLinesAdded,
            lines_removed: snapshot.totalLinesRemoved,
          },
        }, null, 2);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `📊 Performance Report (JSON):\n\n${report}`,
        });
      },
    },
  ],
};
