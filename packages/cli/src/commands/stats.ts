/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import fs from 'node:fs';
import path from 'node:path';
import { Dashboard } from '../ui/dashboard.js';
import { PerformanceService } from '../services/performance-service.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';
import { RegressionDetector } from '@google/gemini-cli-core';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Prevent CSV injection
 */
function sanitizeCsv(value: string | number): string {
  const str = String(value);
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'json' || value === 'csv' || value === 'html';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

type ExportFormat = 'json' | 'csv' | 'html';

export const perfCommand: CommandModule = {
  command: 'perf',
  aliases: ['dashboard', 'stats'],
  describe: '📊 Performance monitoring dashboard',
  builder: (yargs) =>
    yargs
      .option('live', {
        alias: 'l',
        type: 'boolean',
        description: 'Show live updating dashboard',
        default: false,
      })
      .option('export', {
        alias: 'e',
        type: 'string',
        description: 'Export report (json|csv|html)',
        choices: ['json', 'csv', 'html'],
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output file for export',
      })
      .option('ci', {
        type: 'boolean',
        description: 'Run in CI mode (checks for regressions)',
      })
      .option('save-baseline', {
        type: 'boolean',
        description: 'Save current metrics as baseline',
      })
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      }),

  handler: async (argv) => {
    try {
      // Setup performance monitoring
      PerformanceService.setupHooks();

      if (argv['export']) {
        const formatVal = argv['export'];
        if (!isExportFormat(formatVal)) {
          throw new Error('Invalid export format');
        }
        const format = formatVal;

        // eslint-disable-next-line no-console
        console.log(
          chalk.blue(`📊 Exporting performance report as ${format}...`),
        );

        const data = await PerformanceService.getCurrentMetrics();

        let content = '';

        if (format === 'json') {
          content = JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
          content = 'Tool,Calls,AvgDuration,SuccessRate\n';

          Object.entries(data.tools.stats).forEach(([tool, s]) => {
            content += `${sanitizeCsv(tool)},${s.callCount},${s.avgTime},${s.successRate}\n`;
          });
        } else if (format === 'html') {
          const safeData = escapeHtml(JSON.stringify(data, null, 2));

          content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Performance Report</title>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none';">
</head>
<body>
  <h1>Performance Report</h1>
  <pre>${safeData}</pre>
</body>
</html>`;
        }

        const outputVal = argv['output'];
        const fileName = isString(outputVal)
          ? outputVal
          : `perf-report-${Date.now()}.${format}`;

        // Secure file permissions
        fs.writeFileSync(fileName, content, { mode: 0o600 });

        // eslint-disable-next-line no-console
        console.log(
          chalk.green(`✅ Report exported to: ${path.resolve(fileName)}`),
        );

        PerformanceService.cleanup();
        return;
      }

      const detector = new RegressionDetector();

      if (argv['save-baseline']) {
        // eslint-disable-next-line no-console
        console.log(chalk.blue('📊 Saving baseline metrics...'));

        const data = await PerformanceService.getCurrentMetrics();
        const filepath = await detector.saveBaseline(data.version, data);

        // eslint-disable-next-line no-console
        console.log(chalk.green(`✅ Baseline saved to ${filepath}`));

        PerformanceService.cleanup();
        return;
      }

      if (argv['ci']) {
        // eslint-disable-next-line no-console
        console.log(chalk.blue('🔍 Running performance regression check...'));

        const data = await PerformanceService.getCurrentMetrics();
        const report = await detector.runCICheck(data, {
          exitOnFailure: true,
        });

        if (report.passed) {
          // eslint-disable-next-line no-console
          console.log(chalk.green('✅ No performance regressions detected.'));
        } else {
          // eslint-disable-next-line no-console
          console.log(chalk.red('❌ Performance regressions detected.'));
        }

        PerformanceService.cleanup();
        return;
      }

      // Show the React dashboard
      const liveVal = argv['live'];
      const { waitUntilExit } = render(
        React.createElement(Dashboard, {
          live: isBoolean(liveVal) ? liveVal : false,
          onExit: () => {
            PerformanceService.cleanup();
            process.exit(0);
          },
        }),
      );

      process.on('SIGINT', () => {
        PerformanceService.cleanup();
        process.exit(0);
      });

      await waitUntilExit();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : error,
      );

      PerformanceService.cleanup();
      process.exit(1);
    }
  },
};
