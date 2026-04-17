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

function readLastLines(filePath: string, count: number): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.slice(-count).join('\n') + '\n';
}

const isWindows = process.platform === 'win32';

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
      if (isWindows) {
        process.stdout.write(readLastLines(logPath, lines));
        await exitCli(0);
        return;
      }
      const tailArgs = ['-n', String(lines), logPath];
      const child = spawn('tail', tailArgs, { stdio: 'inherit' });
      child.on('close', async (code) => {
        await exitCli(code ?? 0);
      });
      return;
    }

    if (isWindows) {
      debugLogger.log(
        'Live log following is not supported on Windows. Use --lines N to view recent logs.',
      );
      await exitCli(1);
      return;
    }

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
