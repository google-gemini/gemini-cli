/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import {
  DEFAULT_PORT,
  getPidFilePath,
  getLogFilePath,
  getLiteRtBinDir,
  SERVER_START_WAIT_MS,
} from './constants.js';
import {
  getBinaryPath,
  isBinaryInstalled,
  isServerRunning,
} from './platform.js';

/**
 * Starts the LiteRT-LM server as a detached background process.
 * Returns true if the server was started (or is already running).
 *
 * This function is also used by `setup.ts` to start the server after installation.
 */
export async function startServer(
  binaryPath: string,
  port: number,
): Promise<boolean> {
  // Check if already running
  const alreadyRunning = await isServerRunning(port);
  if (alreadyRunning) {
    debugLogger.log(`LiteRT server already running on port ${port}`);
    return true;
  }

  // Ensure log directory exists
  const logPath = getLogFilePath();
  fs.mkdirSync(getLiteRtBinDir(), { recursive: true });
  // Ensure tmp dir exists for log and pid files
  const tmpDir = getPidFilePath().replace(/\/[^/]+$/, '');
  fs.mkdirSync(tmpDir, { recursive: true });

  const logFd = fs.openSync(logPath, 'a');

  try {
    const child = spawn(binaryPath, ['serve', `--port=${port}`, '--verbose'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });

    // Write PID file
    const pidPath = getPidFilePath();
    if (child.pid) {
      fs.writeFileSync(pidPath, String(child.pid), 'utf-8');
    }

    // Detach the child so it survives after the CLI exits.
    child.unref();
  } finally {
    fs.closeSync(logFd);
  }

  // Wait briefly and verify the server is responding.
  await new Promise((resolve) => setTimeout(resolve, SERVER_START_WAIT_MS));
  return isServerRunning(port);
}

export const startCommand: CommandModule = {
  command: 'start',
  describe: 'Start the LiteRT-LM server',
  builder: (yargs) =>
    yargs.option('port', {
      type: 'number',
      description: 'Port for the LiteRT server',
    }),
  handler: async (argv) => {
    let port: number | undefined;
    if (argv['port'] !== undefined) {
      port = Number(argv['port']);
    }

    if (!port) {
      try {
        const { loadSettings } = await import('../../config/settings.js');
        const settings = loadSettings(process.cwd());
        const hostStr =
          settings.merged.experimental?.gemmaModelRouter?.classifier?.host;
        if (hostStr) {
          const match = hostStr.match(/:(\d+)/);
          if (match) {
            port = parseInt(match[1], 10);
          }
        }
      } catch {
        // Ignore
      }
      port = port ?? DEFAULT_PORT;
    }

    if (!isBinaryInstalled()) {
      debugLogger.error(
        chalk.red(
          'LiteRT-LM binary not found. Run "gemini gemma setup" first.',
        ),
      );
      await exitCli(1);
      return;
    }

    const alreadyRunning = await isServerRunning(port);
    if (alreadyRunning) {
      debugLogger.log(
        chalk.green(`LiteRT server is already running on port ${port}.`),
      );
      await exitCli(0);
      return;
    }

    const binaryPath = getBinaryPath()!;
    debugLogger.log(`Starting LiteRT server on port ${port}...`);

    const started = await startServer(binaryPath, port);
    if (started) {
      debugLogger.log(chalk.green(`LiteRT server started on port ${port}.`));
      debugLogger.log(chalk.dim(`Logs: ${getLogFilePath()}`));
      await exitCli(0);
    } else {
      debugLogger.error(
        chalk.red('Server may not have started correctly. Check logs:'),
      );
      debugLogger.error(chalk.dim(`  ${getLogFilePath()}`));
      await exitCli(1);
    }
  },
};
