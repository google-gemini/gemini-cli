/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { getLogFilePath } from './constants.js';

export const logsCommand: CommandModule = {
  command: 'logs',
  describe: 'View LiteRT-LM server logs',
  builder: (yargs) =>
    yargs
      .option('lines', {
        alias: 'n',
        type: 'number',
        description: 'Show the last N lines and exit (omit to follow live)',
      })
      .option('follow', {
        alias: 'f',
        type: 'boolean',
        default: true,
        description: 'Follow log output (default when --lines is not set)',
      }),
  handler: async (argv) => {
    const logPath = getLogFilePath();

    if (!fs.existsSync(logPath)) {
      debugLogger.log(`No log file found at ${logPath}`);
      debugLogger.log(
        'Is the LiteRT server running? Start it with: gemini gemma start',
      );
      await exitCli(1);
      return;
    }

    const rawLines = argv['lines'];
    const lines = Number.isFinite(rawLines) ? Number(rawLines) : undefined;

    if (lines !== undefined) {
      // Show last N lines and exit.
      const tailArgs = ['-n', String(lines), logPath];
      const child = spawn('tail', tailArgs, { stdio: 'inherit' });
      child.on('close', async (code) => {
        await exitCli(code ?? 0);
      });
      return;
    }

    // Follow mode — stream live output until user presses Ctrl+C.
    debugLogger.log(`Tailing ${logPath} (Ctrl+C to stop)\n`);
    const tailArgs = ['-f', '-n', '20', logPath];
    const child = spawn('tail', tailArgs, { stdio: 'inherit' });

    process.on('SIGINT', () => {
      child.kill('SIGTERM');
    });

    child.on('close', async (code) => {
      await exitCli(code ?? 0);
    });
  },
};
