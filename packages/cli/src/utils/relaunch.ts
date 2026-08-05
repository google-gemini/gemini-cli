/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import {
  RELAUNCH_EXIT_CODE,
  getSpawnConfig,
  getScriptArgs,
} from './processUtils.js';
import {
  writeToStderr,
  type AdminControlsSettings,
} from '@google/gemini-cli-core';

// Signals a supervising process (ACP client, systemd, container runtime)
// may send to the bootstrap parent. Without forwarding, the parent dies on
// its default disposition while the spawned child is reparented to PID 1
// and keeps running - holding the OAuth session and allocated heap until
// killed manually. See #25590.
// SIGINT/SIGQUIT are intentionally NOT forwarded: when running
// interactively, the TTY delivers them to the whole foreground process
// group (parent and child), so forwarding would deliver them twice and
// could interrupt the child's graceful-shutdown handler. Supervisors use
// SIGTERM for programmatic termination, which is forwarded.
const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGTERM',
  'SIGHUP',
  'SIGUSR1',
  'SIGUSR2',
];

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

  let latestAdminSettings = remoteAdminSettings;

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
    });

    if (latestAdminSettings) {
      child.send({ type: 'admin-settings', settings: latestAdminSettings });
    }

    child.on('message', (msg: { type?: string; settings?: unknown }) => {
      if (msg.type === 'admin-settings-update' && msg.settings) {
        latestAdminSettings = msg.settings as AdminControlsSettings;
      }
    });

    // Forward termination signals to the child so a supervised parent
    // (kill -TERM <bootstrap-pid>) takes the child down with it instead of
    // orphaning it. Use a Map of {signal -> handler} for precise cleanup on
    // close/error; removeAllListeners would disturb unrelated subscribers,
    // and leaking a handler per relaunch iteration trips
    // MaxListenersExceededWarning after ~10 relaunches. #25590.
    const forwarders = new Map<NodeJS.Signals, () => void>();
    for (const sig of FORWARDED_SIGNALS) {
      const handler = () => {
        try {
          child.kill(sig);
        } catch {
          // The child may have already exited; ignore the race.
        }
      };
      forwarders.set(sig, handler);
      // Use once() so the first signal is forwarded to the child for a
      // graceful shutdown, and a second signal (e.g. a second Ctrl+C while
      // the child is hung) takes the default disposition and force-quits the
      // parent instead of being silently forwarded again.
      process.once(sig, handler);
    }
    const removeForwarders = () => {
      for (const [sig, handler] of forwarders) {
        process.off(sig, handler);
      }
      forwarders.clear();
    };

    return new Promise<number>((resolve, reject) => {
      child.on('error', (err) => {
        removeForwarders();
        reject(err);
      });
      child.on('close', (code) => {
        removeForwarders();
        // Resume stdin before the parent process exits.
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
