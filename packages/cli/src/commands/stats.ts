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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const format = argv['export'] as string;
        // eslint-disable-next-line no-console
        console.log(
          chalk.blue(`📊 Exporting performance report as ${format}...`),
        );
        const data = await PerformanceService.getCurrentMetrics();

        let content = '';
        if (format === 'json') {
          content = JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
          // Simple CSV for tools
          content = 'Tool,Calls,AvgDuration,SuccessRate\n';
          Object.entries(data.tools.stats).forEach(([tool, s]) => {
            content += `${tool},${s.callCount},${s.avgTime},${s.successRate}\n`;
          });
        } else {
          content = `<html><body><h1>Performance Report</h1><pre>${JSON.stringify(
            data,
            null,
            2,
          )}</pre></body></html>`;
        }

        const fileName =
          typeof argv['output'] === 'string'
            ? argv['output']
            : `perf-report-${Date.now()}.${format}`;
        fs.writeFileSync(fileName, content);

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
      const { waitUntilExit } = render(
        React.createElement(Dashboard, {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          live: (argv['live'] as boolean) || false,
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
      console.error(chalk.red('Error:'), error);
      PerformanceService.cleanup();
      process.exit(1);
    }
  },
};
