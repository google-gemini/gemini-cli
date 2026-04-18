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
    const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

    // The parent process should not be reading from stdin while the child is running.
    process.stdin.pause();

    const child = spawn(process.execPath, nodeArgs, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: newEnv,
    });

    // Forward termination signals so the whole process tree exits cleanly
    // rather than orphaning the child under PID 1 / the user's systemd
    // manager. Programmatic signals (e.g. `kill -INT <parent_pid>`,
    // systemd/container runtimes, supervising ACP clients) target only the
    // parent and would otherwise leave the child orphaned. Terminal-generated
    // signals (Ctrl+C, Ctrl+\) are already delivered to the whole foreground
    // process group by the terminal; the resulting double-delivery is
    // harmless for typical signal handlers and strictly preferable to
    // orphaning. Waiting for the child to exit via the installed listeners
    // also keeps the terminal state clean by preventing the shell prompt
    // from returning mid-cleanup.
    const FORWARDED_SIGNALS: NodeJS.Signals[] = [
      'SIGTERM',
      'SIGHUP',
      'SIGINT',
      'SIGQUIT',
      'SIGUSR1',
      'SIGUSR2',
    ];
    const forwarders = new Map<NodeJS.Signals, () => void>();
    const removeForwarders = () => {
      for (const [sig, handler] of forwarders) {
        process.off(sig, handler);
      }
      forwarders.clear();
    };

    if (latestAdminSettings) {
      child.send({ type: 'admin-settings', settings: latestAdminSettings });
    }

    // Attach listeners only after any synchronous IPC setup that could throw,
    // so a thrown child.send() doesn't leak listeners on the parent process.
    for (const sig of FORWARDED_SIGNALS) {
      const handler = () => {
        try {
          child.kill(sig);
        } catch {
          // Child may already be gone; ignore.
        }
      };
      forwarders.set(sig, handler);
      process.on(sig, handler);
    }

    child.on('message', (msg: { type?: string; settings?: unknown }) => {
      if (msg.type === 'admin-settings-update' && msg.settings) {
        latestAdminSettings = msg.settings as AdminControlsSettings;
      }
    });

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
