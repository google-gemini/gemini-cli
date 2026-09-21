/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  Storage,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  ExitCodes,
  resetBrowserSession,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';

const cleanupFunctions: Array<(() => void) | (() => Promise<void>)> = [];
const syncCleanupFunctions: Array<() => void> = [];
let configForTelemetry: Config | null = null;
let isShuttingDown = false;

export function registerCleanup(fn: (() => void) | (() => Promise<void>)) {
  cleanupFunctions.push(fn);
}

export function removeCleanup(fn: (() => void) | (() => Promise<void>)) {
  const index = cleanupFunctions.indexOf(fn);
  if (index !== -1) {
    cleanupFunctions.splice(index, 1);
  }
}

export function registerSyncCleanup(fn: () => void) {
  syncCleanupFunctions.push(fn);
}

export function removeSyncCleanup(fn: () => void) {
  const index = syncCleanupFunctions.indexOf(fn);
  if (index !== -1) {
    syncCleanupFunctions.splice(index, 1);
  }
}

/**
 * Resets the internal cleanup state for testing purposes.
 * This allows tests to run in isolation without vi.resetModules().
 */
export function resetCleanupForTesting() {
  cleanupFunctions.length = 0;
  syncCleanupFunctions.length = 0;
  configForTelemetry = null;
  isShuttingDown = false;
}

export function runSyncCleanup() {
  for (const fn of syncCleanupFunctions) {
    try {
      fn();
    } catch {
      // Ignore errors during cleanup.
    }
  }
  syncCleanupFunctions.length = 0;
}

/**
 * Register the config instance for telemetry shutdown.
 * This must be called early in the application lifecycle.
 */
export function registerTelemetryConfig(config: Config) {
  configForTelemetry = config;
}

export async function runExitCleanup() {
  // drain stdin to prevent printing garbage on exit
  // https://github.com/google-gemini/gemini-cli/issues/16801
  await drainStdin();

  runSyncCleanup();
  for (const fn of cleanupFunctions) {
    try {
      await Promise.race([
        Promise.resolve(fn()),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Cleanup step timed out')), 3000),
        ),
      ]);
    } catch {
      // Ignore errors during cleanup.
    }
  }
  cleanupFunctions.length = 0; // Clear the array

  // Close persistent browser sessions before disposing config
  try {
    await Promise.race([
      resetBrowserSession(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Browser cleanup timed out')), 2000),
      ),
    ]);
  } catch {
    // Ignore errors during browser cleanup
  }

  if (configForTelemetry) {
    try {
      await Promise.race([
        configForTelemetry.dispose(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Config dispose timed out')), 5000),
        ),
      ]);
    } catch {
      // Ignore errors during disposal
    }
  }

  // IMPORTANT: Shutdown telemetry AFTER all other cleanup functions have run
  // This ensures SessionEnd hooks and other telemetry are properly flushed
  if (configForTelemetry && isTelemetrySdkInitialized()) {
    try {
      await Promise.race([
        shutdownTelemetry(configForTelemetry),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Telemetry shutdown timed out')), 3000),
        ),
      ]);
    } catch {
      // Ignore errors during telemetry shutdown
    }
  }
}

async function drainStdin() {
  if (!process.stdin?.isTTY) return;
  // Resume stdin and attach a no-op listener to drain the buffer.
  // We use removeAllListeners to ensure we don't trigger other handlers.
  process.stdin
    .resume()
    .removeAllListeners('data')
    .on('data', () => {});
  // Give it a moment to flush the OS buffer.
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    process.stdin.pause();
    process.stdin.removeAllListeners('data');
    process.stdin.unref();
  } catch {
    // Ignore errors pausing stdin.
  }
}

/**
 * Gracefully shuts down the process, ensuring cleanup runs exactly once.
 * Guards against concurrent shutdown from signals (SIGHUP, SIGTERM, SIGINT)
 * and TTY loss detection racing each other.
 *
 * If a second SIGINT is received while shutting down, immediately force-exits
 * to prevent zombie processes.
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/15874
 * @see https://github.com/google-gemini/gemini-cli/issues/29424
 */
async function gracefulShutdown(reason: string) {
  if (isShuttingDown) {
    if (reason === 'SIGINT') {
      // User pressed Ctrl+C again while waiting for shutdown: force exit immediately
      process.exit(130);
    }
    return;
  }
  isShuttingDown = true;

  // Set a watchdog timer to guarantee process exit even if cleanup hangs
  const forceExitTimeout = setTimeout(() => {
    process.stderr.write(`Shutdown timed out after ${reason}, forcing exit...\n`);
    process.exit(ExitCodes.SUCCESS);
  }, 5000);
  forceExitTimeout.unref();

  try {
    await runExitCleanup();
  } finally {
    clearTimeout(forceExitTimeout);
    process.exit(ExitCodes.SUCCESS);
  }
}

export function setupSignalHandlers() {
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export function setupTtyCheck(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isCheckingTty = false;

  intervalId = setInterval(async () => {
    if (isCheckingTty || isShuttingDown) {
      return;
    }

    if (process.env['SANDBOX']) {
      return;
    }

    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      isCheckingTty = true;

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      await gracefulShutdown('TTY loss');
    }
  }, 5000);

  // Don't keep the process alive just for this interval
  intervalId.unref();

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export async function cleanupCheckpoints() {
  const storage = new Storage(process.cwd());
  await storage.initialize();
  const tempDir = storage.getProjectTempDir();
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if the directory doesn't exist or fails to delete.
  }
}
