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

export async function relaunchOnExitCode(runner: () => Promise<number>) {
  while (true) {
    try {
      const exitCode = await runner();

      if (exitCode !== RELAUNCH_EXIT_CODE) {
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

  let latestAdminSettings = remoteAdminSettings;
  let resumeSessionId: string | undefined = undefined;

  const runner = () => {
    // process.argv is [node, script, ...args]
    // We want to construct [ ...nodeArgs, script, ...scriptArgs]
    const script = process.argv[1];
    let scriptArgs = process.argv.slice(2);

    if (resumeSessionId) {
      const filteredArgs: string[] = [];
      for (let i = 0; i < scriptArgs.length; i++) {
        if (scriptArgs[i] === '--resume') {
          i++; // Skip the next argument as well
          continue;
        }
        if (scriptArgs[i].startsWith('--resume=')) {
          continue;
        }
        filteredArgs.push(scriptArgs[i]);
      }
      scriptArgs = [...filteredArgs, '--resume', resumeSessionId];
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

    child.on(
      'message',
      (msg: { type?: string; settings?: unknown; sessionId?: string }) => {
        if (msg.type === 'admin-settings-update' && msg.settings) {
          latestAdminSettings = msg.settings as AdminControlsSettings;
        } else if (msg.type === 'relaunch-session' && msg.sessionId) {
          resumeSessionId = msg.sessionId;
        }
      },
    );

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
