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
const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGTERM',
  'SIGHUP',
  'SIGUSR1',
  'SIGUSR2',
];

// SIGINT/SIGQUIT are intentionally NOT forwarded: when running
// interactively, the TTY delivers them to the whole foreground process
// group (parent and child), so forwarding would deliver them twice and
// could interrupt the child's graceful-shutdown handler. Instead the parent
// registers a no-op handler (KEEPALIVE_SIGNALS) so it does NOT die on its
// default disposition before the child finishes shutting down - which would
// orphan the child and return the shell prompt early with mixed output. The
// child receives the signal directly from the TTY; when it exits, the no-op
// handler is removed and the child's exit signal is re-raised on the parent.
// Supervisors use SIGTERM for programmatic termination, which is forwarded.
const KEEPALIVE_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGQUIT'];

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
      // Use on() so that if the child is slow to shut down and a second
      // signal is received, it is still forwarded rather than killing the
      // parent immediately and orphaning the child. The listeners are
      // removed on child close/error anyway. #25590.
      process.on(sig, handler);
    }
    // No-op handlers for the interactive interrupt signals the TTY delivers to
    // the whole foreground process group. The parent must survive long enough
    // for the child to finish its graceful shutdown; otherwise it dies on the
    // default disposition and the child is orphaned. The no-op is removed in
    // the close handler before the child's exit signal is re-raised, so the
    // re-raise still terminates the parent. #25590.
    for (const sig of KEEPALIVE_SIGNALS) {
      // Reuse the same handler reference for both the Map and the listener so
      // removeForwarders can process.off() it on close.
      const handler = () => {};
      forwarders.set(sig, handler);
      process.on(sig, handler);
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
      child.on('close', (code, signal) => {
        removeForwarders();
        // Resume stdin before the parent process exits.
        process.stdin.resume();
        // Propagate the child's signal termination so supervisors (systemd,
        // Kubernetes) see a clean signal exit rather than an unexpected code
        // 1 crash. #25590.
        if (signal) {
          try {
            process.kill(process.pid, signal);
            // Do NOT return here: a non-fatal signal (e.g. SIGUSR1) does not
            // terminate this process, so we must still resolve the promise
            // below. If the signal IS fatal, this process exits before
            // resolve runs - which is the desired outcome.
          } catch {
            // Fall back to exit code 1 if the signal cannot be re-raised.
          }
        }
        resolve(code ?? 1);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
