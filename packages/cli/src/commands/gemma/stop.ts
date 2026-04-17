/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';
import { DEFAULT_PORT, getPidFilePath } from './constants.js';
import {
  readServerPid,
  isProcessRunning,
  isServerRunning,
  resolveGemmaConfig,
} from './platform.js';

export async function stopServer(): Promise<boolean> {
  const pid = readServerPid();
  const pidPath = getPidFilePath();

  if (pid === null) {
    return false;
  }

  if (!isProcessRunning(pid)) {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    fs.unlinkSync(pidPath);
  } catch {
    // ignore
  }

  return true;
}
export const stopCommand: CommandModule = {
  command: 'stop',
  describe: 'Stop the LiteRT-LM server',
  builder: (yargs) =>
    yargs.option('port', {
      type: 'number',
      description: 'Port where the LiteRT server is running',
    }),
  handler: async (argv) => {
    let port: number | undefined;
    if (argv['port'] !== undefined) {
      port = Number(argv['port']);
    }

    if (!port) {
      const { configuredPort } = resolveGemmaConfig(DEFAULT_PORT);
      port = configuredPort;
    }

    const pid = readServerPid();

    if (pid !== null && isProcessRunning(pid)) {
      debugLogger.log(`Stopping LiteRT server (PID ${pid})...`);
      const stopped = await stopServer();
      if (stopped) {
        debugLogger.log(chalk.green('LiteRT server stopped.'));
        await exitCli(0);
      } else {
        debugLogger.error(chalk.red('Failed to stop LiteRT server.'));
        await exitCli(1);
      }
      return;
    }

    const running = await isServerRunning(port);
    if (running) {
      debugLogger.log(
        chalk.yellow(
          `A server is responding on port ${port}, but it was not started by "gemini gemma start".`,
        ),
      );
      debugLogger.log(
        chalk.dim(
          'If you started it manually, stop it from the terminal where it is running.',
        ),
      );
      await exitCli(1);
    } else {
      debugLogger.log('No LiteRT server is currently running.');
      await exitCli(0);
    }
  },
};
