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
  getBinaryPath,
  isExpectedLiteRtServerProcess,
  isProcessRunning,
  isServerRunning,
  readServerPid,
  readServerProcessInfo,
  resolveGemmaConfig,
} from './platform.js';

export type StopServerResult =
  | 'stopped'
  | 'not-running'
  | 'unexpected-process'
  | 'failed';

export async function stopServer(
  expectedPort?: number,
): Promise<StopServerResult> {
  const processInfo = readServerProcessInfo();
  const pidPath = getPidFilePath();

  if (!processInfo) {
    return 'not-running';
  }

  const { pid } = processInfo;
  if (!isProcessRunning(pid)) {
    debugLogger.log(
      `Stale PID file found (PID ${pid} is not running), removing ${pidPath}`,
    );
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
    return 'not-running';
  }

  const binaryPath = processInfo.binaryPath ?? getBinaryPath();
  const port = processInfo.port ?? expectedPort;
  if (!isExpectedLiteRtServerProcess(pid, { binaryPath, port })) {
    debugLogger.warn(
      `Refusing to stop PID ${pid} because it does not match the expected LiteRT server process.`,
    );
    return 'unexpected-process';
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return 'failed';
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (isProcessRunning(pid)) {
      return 'failed';
    }
  }

  try {
    fs.unlinkSync(pidPath);
  } catch {
    // ignore
  }

  return 'stopped';
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

    const processInfo = readServerProcessInfo();
    const pid = processInfo?.pid ?? readServerPid();

    if (pid !== null && isProcessRunning(pid)) {
      debugLogger.log(`Stopping LiteRT server (PID ${pid})...`);
      const result = await stopServer(port);
      if (result === 'stopped') {
        debugLogger.log(chalk.green('LiteRT server stopped.'));
        await exitCli(0);
      } else if (result === 'unexpected-process') {
        debugLogger.error(
          chalk.red(
            `Refusing to stop PID ${pid} because it does not match the expected LiteRT server process.`,
          ),
        );
        debugLogger.error(
          chalk.dim(
            'Remove the stale pid file after verifying the process, or stop the process manually.',
          ),
        );
        await exitCli(1);
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
