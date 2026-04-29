#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import v8 from 'node:v8';
import {
  RELAUNCH_EXIT_CODE,
  getSpawnConfig,
  getScriptArgs,
} from './src/utils/processUtils.js';

// --- Global Entry Point ---

// Suppress known race condition error in node-pty on Windows
// Tracking bug: https://github.com/microsoft/node-pty/issues/827
process.on('uncaughtException', (error) => {
  if (
    process.platform === 'win32' &&
    error instanceof Error &&
    error.message === 'Cannot resize a pty that has already exited'
  ) {
    // This error happens on Windows with node-pty when resizing a pty that has just exited.
    // It is a race condition in node-pty that we cannot prevent, so we silence it.
    return;
  }

  // For other errors, we rely on the default behavior, but since we attached a listener,
  // we must manually replicate it.
  if (error instanceof Error) {
    process.stderr.write(error.stack + '\n');
  } else {
    process.stderr.write(String(error) + '\n');
  }
  process.exit(1);
});

async function getMemoryNodeArgs(): Promise<string[]> {
  let autoConfigureMemory = true;
  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Respect GEMINI_CLI_HOME environment variable, falling back to os.homedir()
    const baseDir =
      process.env['GEMINI_CLI_HOME'] || join(os.homedir(), '.gemini');
    const settingsPath = join(baseDir, 'settings.json');
    const rawSettings = readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(rawSettings);
    if (settings?.advanced?.autoConfigureMemory === false) {
      autoConfigureMemory = false;
    }
  } catch {
    // ignore
  }

  if (autoConfigureMemory) {
    const totalMemoryMB = os.totalmem() / (1024 * 1024);
    const heapStats = v8.getHeapStatistics();
    const currentMaxOldSpaceSizeMb = Math.floor(
      heapStats.heap_size_limit / 1024 / 1024,
    );
    const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);

    if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
      return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
    }
  }

  return [];
}

async function run() {
  if (!process.env['GEMINI_CLI_NO_RELAUNCH'] && !process.env['SANDBOX']) {
    // --- Lightweight Parent Process / Daemon ---
    // We avoid importing heavy dependencies here to save ~1.5s of startup time.

    const scriptArgs = getScriptArgs();
    const memoryArgs = await getMemoryNodeArgs();
    const { spawnArgs, env: newEnv } = getSpawnConfig(memoryArgs, scriptArgs);

    let latestAdminSettings: unknown = undefined;

    // Prevent the parent process from exiting prematurely on signals.
    // The child process will receive the same signals and handle its own cleanup.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(sig as NodeJS.Signals, () => {});
    }

    const runner = () => {
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
          latestAdminSettings = msg.settings;
        }
      });

      return new Promise<number>((resolve) => {
        child.on('error', (err) => {
          process.stderr.write(
            'Error: Failed to start child process: ' + err.message + '\n',
          );
          resolve(1);
        });
        child.on('close', (code) => {
          process.stdin.resume();
          resolve(code ?? 1);
        });
      });
    };

    while (true) {
      try {
        const exitCode = await runner();
        if (exitCode !== RELAUNCH_EXIT_CODE) {
          process.exit(exitCode);
        }
      } catch (error: unknown) {
        process.stdin.resume();
        process.stderr.write(
          `Fatal error: Failed to relaunch the CLI process.\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        process.exit(1);
      }
    }
  } else {
    // --- Heavy Child Process ---
    // Now we can safely import everything.
    const { main } = await import('./src/gemini.js');
    const { FatalError, writeToStderr } = await import(
      '@google/gemini-cli-core'
    );
    const { runExitCleanup } = await import('./src/utils/cleanup.js');

    main().catch(async (error: unknown) => {
      // Set a timeout to force exit if cleanup hangs
      const cleanupTimeout = setTimeout(() => {
        writeToStderr('Cleanup timed out, forcing exit...\n');
        process.exit(1);
      }, 5000);

      try {
        await runExitCleanup();
      } catch (cleanupError: unknown) {
        writeToStderr(
          `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
        );
      } finally {
        clearTimeout(cleanupTimeout);
      }

      if (error instanceof FatalError) {
        let errorMessage = error.message;
        if (!process.env['NO_COLOR']) {
          errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
        }
        writeToStderr(errorMessage + '\n');
        process.exit(error.exitCode);
      }

      writeToStderr('An unexpected critical error occurred:');
      if (error instanceof Error) {
        writeToStderr(error.stack + '\n');
      } else {
        writeToStderr(String(error) + '\n');
      }
      process.exit(1);
    });
  }
}

run();
