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
  debugLogger,
  ExitCodes,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';

const cleanupFunctions: Array<(() => void) | (() => Promise<void>)> = [];
const syncCleanupFunctions: Array<() => void> = [];
let configForTelemetry: Config | null = null;

export function registerCleanup(fn: (() => void) | (() => Promise<void>)) {
  cleanupFunctions.push(fn);
}

export function registerSyncCleanup(fn: () => void) {
  syncCleanupFunctions.push(fn);
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
    } catch (_) {
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
  // https://github.com/google-gemini/gemini-cli/issues/1680
  await drainStdin();

  runSyncCleanup();
  for (const fn of cleanupFunctions) {
    try {
      await fn();
    } catch (_) {
      // Ignore errors during cleanup.
    }
  }
  cleanupFunctions.length = 0; // Clear the array

  if (configForTelemetry) {
    try {
      await configForTelemetry.dispose();
    } catch (_) {
      // Ignore errors during disposal
    }
  }

  // IMPORTANT: Shutdown telemetry AFTER all other cleanup functions have run
  // This ensures SessionEnd hooks and other telemetry are properly flushed
  if (configForTelemetry && isTelemetrySdkInitialized()) {
    try {
      await shutdownTelemetry(configForTelemetry);
    } catch (_) {
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
}

/**
 * Sets up signal handlers to ensure graceful shutdown and prevent orphaned
 * processes from consuming 100% CPU when the terminal is closed.
 *
 * Handles:
 * - SIGHUP: Terminal hangup (terminal window closed)
 * - SIGTERM: Termination request
 * - SIGINT: Interrupt (Ctrl+C) - as fallback, Ink handles this in interactive mode
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/15874
 */
let isShuttingDown = false;

const gracefulShutdown = async (reason: string) => {
  // Prevent multiple concurrent shutdown attempts
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  debugLogger.debug(`Shutting down gracefully due to ${reason}...`);
  try {
    await runExitCleanup();
  } catch (err) {
    debugLogger.debug(`Error during cleanup for ${reason}:`, err);
  }
  process.exit(ExitCodes.SUCCESS);
};

export function setupSignalHandlers() {
  // SIGHUP is sent when terminal is closed - critical for preventing orphans
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  // SIGINT is handled by Ink in interactive mode, but we need it for non-interactive
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

/**
 * Sets up periodic TTY check to detect lost controlling terminal.
 * This is a defense-in-depth measure for cases where SIGHUP is not received
 * or not processed correctly (e.g., certain terminal emulators, tmux detach).
 *
 * @returns Cleanup function to stop the TTY check interval
 */
export function setupTtyCheck(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isCheckingTty = false;

  intervalId = setInterval(async () => {
    // Prevent concurrent TTY checks
    if (isCheckingTty || isShuttingDown) {
      return;
    }

    // Skip check in sandbox mode or if explicitly running non-interactively
    if (process.env['SANDBOX'] || process.env['GEMINI_NON_INTERACTIVE']) {
      return;
    }

    // Check if we've lost both stdin and stdout TTY
    if (!process.stdin.isTTY && !process.stdout.isTTY) {
      isCheckingTty = true;

      // Clear interval BEFORE starting cleanup to prevent race condition
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
