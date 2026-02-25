/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PerformanceDataService } from '@google/gemini-cli-core';
import type { HistoryItemPerf } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

type PerfView = 'startup' | 'memory' | 'tools' | 'api' | 'session';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function toMarkdown(
  snapshot: ReturnType<typeof PerformanceDataService.getPerformanceSnapshot>,
): string {
  const lines: string[] = [
    '# Performance Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  lines.push('## Startup', '');
  if (snapshot.startup.length === 0) {
    lines.push('No startup phases recorded.', '');
  } else {
    lines.push('| Phase | Duration (ms) |', '|--------|---------------|');
    for (const p of snapshot.startup) {
      lines.push(`| ${p.name} | ${p.duration_ms.toFixed(2)} |`);
    }
    lines.push('');
  }

  lines.push('## Memory', '');
  lines.push(`- **heapUsed**: ${formatBytes(snapshot.memory.heapUsed)}`);
  lines.push(`- **rss**: ${formatBytes(snapshot.memory.rss)}`);
  lines.push(
    `- **highWaterMark**: ${formatBytes(snapshot.memory.highWaterMark)}`,
  );
  lines.push('');

  lines.push('## Tools', '');
  if (snapshot.tools.length === 0) {
    lines.push('No tool calls recorded.', '');
  } else {
    lines.push(
      '| Tool | Call count | Total time (ms) |',
      '|------|------------|-----------------|',
    );
    for (const t of snapshot.tools) {
      lines.push(
        `| ${t.name} | ${t.callCount} | ${t.totalExecutionTimeMs.toFixed(0)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## API', '');
  lines.push(`- **Total requests**: ${snapshot.api.totalRequests}`);
  lines.push(`- **Total errors**: ${snapshot.api.totalErrors}`);
  lines.push(`- **Error rate**: ${(snapshot.api.errorRate * 100).toFixed(2)}%`);
  lines.push('');
  if (snapshot.api.byModel.length > 0) {
    lines.push(
      '| Model | Requests | Errors | Avg latency (ms) |',
      '|-------|----------|--------|------------------|',
    );
    for (const m of snapshot.api.byModel) {
      lines.push(
        `| ${m.model} | ${m.requestCount} | ${m.errorCount} | ${m.avgLatencyMs.toFixed(0)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Session', '');
  lines.push(`- **Uptime (ms)**: ${snapshot.session.uptimeMs}`);
  lines.push(`- **Request count**: ${snapshot.session.requestCount}`);
  lines.push('');

  return lines.join('\n');
}

async function exportJson(context: CommandContext): Promise<void> {
  const snapshot = PerformanceDataService.getPerformanceSnapshot();
  const cwd = process.cwd();
  const path = join(cwd, 'perf-report.json');
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  context.ui.addItem({
    type: 'info',
    text: `Performance report written to ${path}`,
  });
}

async function exportMd(context: CommandContext): Promise<void> {
  const snapshot = PerformanceDataService.getPerformanceSnapshot();
  const cwd = process.cwd();
  const path = join(cwd, 'perf-report.md');
  writeFileSync(path, toMarkdown(snapshot), 'utf-8');
  context.ui.addItem({
    type: 'info',
    text: `Performance report written to ${path}`,
  });
}

const REGRESSION_THRESHOLD = 1.2;
const BASELINE_FILENAME = 'perf-baseline.json';

function checkRegression(context: CommandContext): void {
  const snapshot = PerformanceDataService.getPerformanceSnapshot();
  const currentStartupTotal = snapshot.startup.reduce<number>(
    (sum: number, p: { name: string; duration_ms: number }) =>
      sum + p.duration_ms,
    0,
  );
  if (currentStartupTotal <= 0) return;

  const baselinePath = join(process.cwd(), BASELINE_FILENAME);
  if (!existsSync(baselinePath)) return;

  try {
    const raw = readFileSync(baselinePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const baselineStartup: number | undefined = (() => {
      if (typeof parsed !== 'object' || parsed === null) return undefined;
      if (!('startupTotalMs' in parsed)) return undefined;
      const value = parsed.startupTotalMs;
      if (typeof value === 'number') return value;
      return undefined;
    })();

    if (
      baselineStartup !== undefined &&
      baselineStartup > 0 &&
      currentStartupTotal > baselineStartup * REGRESSION_THRESHOLD
    ) {
      context.ui.addItem({
        type: 'warning',
        text: 'Performance regression detected',
      });
    }
  } catch {
    // Ignore invalid or missing baseline
  }
}

function showDashboard(context: CommandContext, view?: PerfView): void {
  const item: HistoryItemPerf = { type: 'perf', view };
  context.ui.addItem(item);
  checkRegression(context);
}

export const perfCommand: SlashCommand = {
  name: 'perf',
  description:
    'Performance monitoring dashboard. Usage: /perf [startup|memory|tools|api|session] or /perf export [json|md]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context: CommandContext) => {
    showDashboard(context);
  },
  subCommands: [
    {
      name: 'startup',
      description: 'Show startup phase durations',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        showDashboard(context, 'startup');
      },
    },
    {
      name: 'memory',
      description: 'Show memory usage (heap, rss, high water mark)',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        showDashboard(context, 'memory');
      },
    },
    {
      name: 'tools',
      description: 'Show tool execution stats',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        showDashboard(context, 'tools');
      },
    },
    {
      name: 'api',
      description: 'Show API request stats and error rate',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        showDashboard(context, 'api');
      },
    },
    {
      name: 'session',
      description: 'Show session uptime and request count',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        showDashboard(context, 'session');
      },
    },
    {
      name: 'export',
      description: 'Export performance report to file',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      subCommands: [
        {
          name: 'json',
          description: 'Write perf-report.json to current directory',
          kind: CommandKind.BUILT_IN,
          autoExecute: true,
          action: async (context: CommandContext) => {
            await exportJson(context);
          },
        },
        {
          name: 'md',
          description: 'Write perf-report.md to current directory',
          kind: CommandKind.BUILT_IN,
          autoExecute: true,
          action: async (context: CommandContext) => {
            await exportMd(context);
          },
        },
      ],
    },
  ],
};
