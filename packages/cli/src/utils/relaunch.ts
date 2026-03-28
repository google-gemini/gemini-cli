/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { RELAUNCH_EXIT_CODE } from './processUtils.js';
import {
  writeToStderr,
  FatalError,
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
      // Let FatalError subclasses (e.g. FatalSandboxError) propagate to the
      // top-level handler so they are shown with their own message and exit code
      // rather than being buried under a generic "Failed to relaunch" wrapper.
      if (error instanceof FatalError) {
        throw error;
      }
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
  // Session-only env vars sent by child via process.send({ type: 'session-env-update', env: {...} }).
  // Applied to the very next child's environment and cleared afterwards so they
  // don't persist beyond one restart.
  let sessionEnvVars: Record<string, string> = {};

  const runner = () => {
    // process.argv is [node, script, ...args]
    // We want to construct [ ...nodeArgs, script, ...scriptArgs]
    const script = process.argv[1];
    const scriptArgs = process.argv.slice(2);

    const nodeArgs = [
      ...process.execArgv,
      ...additionalNodeArgs,
      script,
      ...additionalScriptArgs,
      ...scriptArgs,
    ];
    const newEnv = {
      ...process.env,
      ...sessionEnvVars,
      GEMINI_CLI_NO_RELAUNCH: 'true',
    };
    // Session env applies for a single restart only.
    sessionEnvVars = {};

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
      (msg: { type?: string; settings?: unknown; env?: unknown }) => {
        if (msg.type === 'admin-settings-update' && msg.settings) {
          latestAdminSettings = msg.settings as AdminControlsSettings;
        }
        if (
          msg.type === 'session-env-update' &&
          typeof msg.env === 'object' &&
          msg.env !== null
        ) {
          const safeEnv: Record<string, string> = {};
          for (const [k, v] of Object.entries(msg.env)) {
            if (typeof v === 'string') safeEnv[k] = v;
          }
          sessionEnvVars = { ...sessionEnvVars, ...safeEnv };
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
