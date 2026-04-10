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
} from './platform.js';

/**
 * Stops the LiteRT-LM server by sending SIGTERM to the stored PID.
 * Returns true if the server was stopped successfully.
 */
export async function stopServer(): Promise<boolean> {
  const pid = readServerPid();
  const pidPath = getPidFilePath();

  if (pid === null) {
    return false;
  }

  if (!isProcessRunning(pid)) {
    // PID file exists but process is gone — clean up stale file.
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // Ignore cleanup errors.
    }
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }

  // Wait briefly for graceful shutdown.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // If still running, escalate to SIGKILL.
  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process may have exited between the check and the kill.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Clean up PID file.
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // Ignore cleanup errors.
  }

  return true;
}

export const stopCommand: CommandModule = {
  command: 'stop',
  describe: 'Stop the LiteRT-LM server',
  builder: (yargs) =>
    yargs.option('port', {
      type: 'number',
      default: DEFAULT_PORT,
      description: 'Port the server is running on',
    }),
  handler: async (argv) => {
    const port = Number(argv['port']);
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

    // No PID file or process not running — check if something else is on the port.
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
