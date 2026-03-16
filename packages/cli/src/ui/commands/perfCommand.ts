/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import type { HistoryItemPerfDashboard, PerfSnapshot } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import { startupProfiler } from '@google/gemini-cli-core';

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
    const avgMs =
      toolStats.count > 0 ? toolStats.durationMs / toolStats.count : 0;
    const successRate =
      toolStats.count > 0 ? (toolStats.success / toolStats.count) * 100 : 0;
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
    const avgLatency =
      modelMetrics.api.totalRequests > 0
        ? modelMetrics.api.totalLatencyMs / modelMetrics.api.totalRequests
        : 0;
    const errorRate =
      modelMetrics.api.totalRequests > 0
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

  // Aggregate model-related totals in a single pass
  const {
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalApiTime,
    totalApiRequests,
  } = Object.values(metrics.models).reduce(
    (totals, m) => {
      totals.totalInputTokens += m.tokens.input;
      totals.totalOutputTokens += m.tokens.candidates;
      totals.totalCachedTokens += m.tokens.cached;
      totals.totalApiTime += m.api.totalLatencyMs;
      totals.totalApiRequests += m.api.totalRequests;
      return totals;
    },
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalApiTime: 0,
      totalApiRequests: 0,
    },
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
    totalApiRequests,
    totalApiTime,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalLinesAdded: metrics.files.totalLinesAdded,
    totalLinesRemoved: metrics.files.totalLinesRemoved,
    startupPhases: startupProfiler.getBufferedPhases().map((p) => ({
      name: p.name,
      durationMs: p.duration_ms,
    })),
  };
}

/**
 * Factory function to create performance dashboard view actions.
 * Reduces duplication across subcommands.
 */
const createPerfViewAction =
  (view: HistoryItemPerfDashboard['view']) => (context: CommandContext) =>
    void context.ui.addItem({
      type: MessageType.PERF_DASHBOARD,
      view,
      snapshot: collectPerfSnapshot(context),
    } as HistoryItemPerfDashboard);

export const perfCommand: SlashCommand = {
  name: 'perf',
  altNames: ['performance'],
  description:
    'Performance monitoring dashboard. Usage: /perf [overview|memory|tools|api|startup|regression|baseline]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  action: createPerfViewAction('overview'),
  subCommands: [
    {
      name: 'overview',
      description: 'Show performance overview dashboard',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: createPerfViewAction('overview'),
    },
    {
      name: 'memory',
      description: 'Show detailed memory usage and warnings',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: createPerfViewAction('memory'),
    },
    {
      name: 'tools',
      description: 'Show tool execution timing and frequency',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: createPerfViewAction('tools'),
    },
    {
      name: 'api',
      description: 'Show model API latency breakdown',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: createPerfViewAction('api'),
    },
    {
      name: 'startup',
      description: 'Show startup sequence performance breakdown',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: createPerfViewAction('startup'),
    },
    {
      name: 'regression',
      description: 'Check for performance regressions against baseline',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        const baselinePath = path.resolve(
          process.cwd(),
          '.gemini-perf-baseline.json',
        );
        let baseline: PerfSnapshot | undefined;

        if (fs.existsSync(baselinePath)) {
          try {
            const content = fs.readFileSync(baselinePath, 'utf8');
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            baseline = JSON.parse(content) as PerfSnapshot;
          } catch (e: unknown) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: `Failed to load baseline: ${e instanceof Error ? e.message : String(e)}`,
            });
          }
        }

        context.ui.addItem({
          type: MessageType.PERF_DASHBOARD,
          view: 'regression',
          snapshot,
          baseline,
        } as HistoryItemPerfDashboard);
      },
    },
    {
      name: 'baseline',
      description: 'Save current performance snapshot as baseline',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context: CommandContext) => {
        const snapshot = collectPerfSnapshot(context);
        const baselinePath = path.resolve(
          process.cwd(),
          '.gemini-perf-baseline.json',
        );
        try {
          fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2));
          context.ui.addItem({
            type: MessageType.INFO,
            text: `📊 Performance baseline saved to \`${baselinePath}\``,
          });
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to save baseline: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
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
        const reportObj = {
          timestamp: new Date().toISOString(),
          session_id: context.session.stats.sessionId,
          uptime_ms: snapshot.uptimeMs,
          memory: snapshot.memory,
          startup: snapshot.startupPhases,
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
        };

        const jsonReport = JSON.stringify(reportObj, null, 2);
        const jsonPath = path.resolve(process.cwd(), 'perf-report.json');

        try {
          fs.writeFileSync(jsonPath, jsonReport);

          // Generate Markdown report
          const mdReport =
            `# Gemini CLI Performance Report\n\n` +
            `**Session ID:** ${reportObj.session_id}\n` +
            `**Timestamp:** ${reportObj.timestamp}\n` +
            `**Uptime:** ${reportObj.uptime_ms}ms\n\n` +
            `## Memory Usage\n` +
            `- Heap Used: ${reportObj.memory.heapUsedMB} MB\n` +
            `- Heap Total: ${reportObj.memory.heapTotalMB} MB\n` +
            `- RSS: ${reportObj.memory.rssMB} MB\n\n` +
            `## Startup Breakdown\n` +
            reportObj.startup
              .map((p) => `- ${p.name}: ${p.durationMs}ms`)
              .join('\n') +
            '\n\n' +
            `## Tool Execution\n` +
            `- Total Calls: ${reportObj.tools.total_calls}\n` +
            `- Total Time: ${reportObj.tools.total_time_ms}ms\n\n` +
            `## API Latency\n` +
            `- Total Requests: ${reportObj.api.total_requests}\n` +
            `- Total Time: ${reportObj.api.total_time_ms}ms\n`;

          const mdPath = path.resolve(process.cwd(), 'perf-report.md');
          fs.writeFileSync(mdPath, mdReport);

          context.ui.addItem({
            type: MessageType.INFO,
            text: `📊 Performance report exported to:\n- \`${jsonPath}\`\n- \`${mdPath}\``,
          });
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to export performance report: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      },
    },
  ],
};
