/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { RELAUNCH_EXIT_CODE } from './processUtils.js';
import {
  writeToStderr,
  type AdminControlsSettings,
} from '@google/gemini-cli-core';

const MAX_RECOVERY_RETRIES = 3;
const RECOVERY_BACKOFF_MS = 1000;

export async function relaunchOnExitCode(
  runner: (isRecovery: boolean) => Promise<number>,
) {
  let recoveryCount = 0;
  let isRecovery = false;

  while (true) {
    try {
      const exitCode = await runner(isRecovery);

      if (exitCode === RELAUNCH_EXIT_CODE) {
        // Intentional relaunch (e.g. settings change)
        isRecovery = false;
        recoveryCount = 0;
        continue;
      }

      if (exitCode !== 0 && recoveryCount < MAX_RECOVERY_RETRIES) {
        // Unintentional crash - attempt self-healing
        recoveryCount++;
        isRecovery = true;
        const delay = RECOVERY_BACKOFF_MS * recoveryCount;
        writeToStderr(
          `\n[Self-Healing] CLI crashed (exit code ${exitCode}). Attempting recovery ${recoveryCount}/${MAX_RECOVERY_RETRIES} in ${delay}ms...\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Successful exit or retry limit reached
      process.exit(exitCode);
    } catch (error) {
      process.stdin.resume();
      const errorMessage =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      writeToStderr(
        `Fatal error: Failed to relaunch the CLI process.\n${errorMessage}\n`,
      );
      process.exit(1);
    }
  }
}

export async function relaunchAppInChildProcess(
  additionalNodeArgs: string[],
  additionalScriptArgs: string[],
  remoteAdminSettings?: AdminControlsSettings,
) {
  if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
    return;
  }

  let latestAdminSettings = remoteAdminSettings;

  const runner = (isRecovery: boolean) => {
    // process.argv is [node, script, ...args]
    // We want to construct [ ...nodeArgs, script, ...scriptArgs]
    const script = process.argv[1];
    let scriptArgs = process.argv.slice(2);

    // If we are recovering from a crash, ensure we resume the latest session
    if (isRecovery && !scriptArgs.includes('--resume')) {
      scriptArgs = ['--resume', 'latest', ...scriptArgs];
    }

    const nodeArgs = [
      ...process.execArgv,
      ...additionalNodeArgs,
      script,
      ...additionalScriptArgs,
      ...scriptArgs,
    ];
    const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

    // The parent process should not be reading from stdin while the child is running.
    process.stdin.pause();

    const child = spawn(process.execPath, nodeArgs, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: newEnv,
    });

    if (latestAdminSettings) {
      child.send({ type: 'admin-settings', settings: latestAdminSettings });
    }

    child.on('message', (msg: { type?: string; settings?: unknown }) => {
      if (msg.type === 'admin-settings-update' && msg.settings) {
        latestAdminSettings = msg.settings as AdminControlsSettings;
      }
    });

    return new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        // Resume stdin before the parent process exits.
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
