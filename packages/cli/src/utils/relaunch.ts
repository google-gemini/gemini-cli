/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import {
  RELAUNCH_EXIT_CODE,
  getSpawnConfig,
  getScriptArgs,
  isSeaEnvironment,
  setupSignalForwarding,
  handleChildProcessClose,
} from './processUtils.js';
import {
  writeToStderr,
  resolveToRealPath,
  type AdminControlsSettings,
} from '@google/gemini-cli-core';

export async function relaunchOnExitCode(runner: () => Promise<number>) {
  while (true) {
    try {
      const exitCode = await runner();

      if (process.platform === 'android' || exitCode !== RELAUNCH_EXIT_CODE) {
        process.exit(exitCode);
      }
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

  if (!isSeaEnvironment() && process.argv[1] && !isAbsolute(process.argv[1])) {
    process.argv[1] = resolve(process.argv[1]);
  }

  let latestAdminSettings = remoteAdminSettings;
  let selectedWorktreePath: string | undefined;

  const runner = () => {
    const scriptArgs = getScriptArgs();
    const { spawnArgs, env: newEnv } = getSpawnConfig(additionalNodeArgs, [
      ...additionalScriptArgs,
      ...scriptArgs,
    ]);

    // The parent process should not be reading from stdin while the child is running.
    process.stdin.pause();

    const child = spawn(process.execPath, spawnArgs, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: newEnv,
      ...(selectedWorktreePath ? { cwd: selectedWorktreePath } : {}),
    });

    // Clear one-time auth override from supervisor environment after passing to child
    delete process.env['GEMINI_CLI_AUTH_OVERRIDE'];
    delete newEnv['GEMINI_CLI_AUTH_OVERRIDE'];

    if (latestAdminSettings) {
      child.send({ type: 'admin-settings', settings: latestAdminSettings });
    }

    child.on(
      'message',
      (msg: {
        type?: string;
        settings?: unknown;
        authType?: string;
        path?: string;
      }) => {
        if (msg?.type === 'admin-settings-update' && msg.settings) {
          latestAdminSettings = msg.settings as AdminControlsSettings;
        }
        if (msg?.type === 'auth-selected-type' && msg.authType) {
          process.env['GEMINI_CLI_AUTH_OVERRIDE'] = msg.authType;
          newEnv['GEMINI_CLI_AUTH_OVERRIDE'] = msg.authType;
        }
        if (
          msg?.type === 'worktree-selected' &&
          typeof msg.path === 'string' &&
          msg.path.length > 0
        ) {
          try {
            const resolvedWorktreePath = resolveToRealPath(msg.path);
            process.chdir(resolvedWorktreePath);
            selectedWorktreePath = resolvedWorktreePath;
            process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';
            newEnv['GEMINI_CLI_WORKTREE_HANDLED'] = '1';
          } catch {
            // Ignore chdir or path validation errors if path is inaccessible
          }
        }
      },
    );

    const removeForwarders = setupSignalForwarding(child);

    return new Promise<number>((resolve, reject) => {
      child.on('error', (err) => {
        removeForwarders();
        reject(err);
      });
      child.on('close', (code, signal) => {
        handleChildProcessClose(code, signal, removeForwarders, resolve);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
