/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { getLogFilePath } from './constants.js';

export async function readLastLines(
  filePath: string,
  count: number,
): Promise<string> {
  if (count <= 0) {
    return '';
  }

  const CHUNK_SIZE = 64 * 1024;
  const fileHandle = await fs.promises.open(filePath, fs.constants.O_RDONLY);

  try {
    const stats = await fileHandle.stat();
    if (stats.size === 0) {
      return '';
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let newlineCount = 0;
    let position = stats.size;

    while (position > 0 && newlineCount <= count) {
      const readSize = Math.min(CHUNK_SIZE, position);
      position -= readSize;

      const buffer = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        readSize,
        position,
      );

      if (bytesRead === 0) {
        break;
      }

      const chunk =
        bytesRead === readSize ? buffer : buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      totalBytes += chunk.length;

      for (const byte of chunk) {
        if (byte === 0x0a) {
          newlineCount += 1;
        }
      }
    }

    const content = Buffer.concat(chunks, totalBytes).toString('utf-8');
    const lines = content.split('\n');

    if (position > 0 && lines.length > 0) {
      const boundary = Buffer.allocUnsafe(1);
      const { bytesRead } = await fileHandle.read(boundary, 0, 1, position - 1);
      if (bytesRead === 1 && boundary[0] !== 0x0a) {
        lines.shift();
      }
    }

    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    if (lines.length === 0) {
      return '';
    }

    return lines.slice(-count).join('\n') + '\n';
  } finally {
    await fileHandle.close();
  }
}

interface LogsArgs {
  lines?: number;
  follow?: boolean;
}

function waitForChild(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

async function runTail(logPath: string, lines: number, follow: boolean) {
  const tailArgs = follow
    ? ['-f', '-n', String(lines), logPath]
    : ['-n', String(lines), logPath];
  const child = spawn('tail', tailArgs, { stdio: 'inherit' });

  if (!follow) {
    return waitForChild(child);
  }

  const handleSigint = () => {
    child.kill('SIGTERM');
  };
  process.once('SIGINT', handleSigint);

  try {
    return await waitForChild(child);
  } finally {
    process.off('SIGINT', handleSigint);
  }
}

export const logsCommand: CommandModule<object, LogsArgs> = {
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
        description:
          'Follow log output (defaults to true when --lines is omitted)',
      }),
  handler: async (argv) => {
    const logPath = getLogFilePath();

    try {
      await fs.promises.access(logPath, fs.constants.F_OK);
    } catch {
      debugLogger.log(`No log file found at ${logPath}`);
      debugLogger.log(
        'Is the LiteRT server running? Start it with: gemini gemma start',
      );
      await exitCli(1);
      return;
    }

    const lines = argv.lines;
    const follow = argv.follow ?? lines === undefined;
    const requestedLines = lines ?? 20;

    if (follow && process.platform === 'win32') {
      debugLogger.log(
        'Live log following is not supported on Windows. Use --lines N to view recent logs.',
      );
      await exitCli(1);
      return;
    }

    if (process.platform === 'win32') {
      process.stdout.write(await readLastLines(logPath, requestedLines));
      await exitCli(0);
      return;
    }

    try {
      if (follow) {
        debugLogger.log(`Tailing ${logPath} (Ctrl+C to stop)\n`);
      }
      const exitCode = await runTail(logPath, requestedLines, follow);
      await exitCli(exitCode);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        if (!follow) {
          process.stdout.write(await readLastLines(logPath, requestedLines));
          await exitCli(0);
        } else {
          debugLogger.error(
            '"tail" command not found. Use --lines N to view recent logs without tail.',
          );
          await exitCli(1);
        }
      } else {
        debugLogger.error(
          `Failed to read log output: ${error instanceof Error ? error.message : String(error)}`,
        );
        await exitCli(1);
      }
    }
  },
};
