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

export async function cleanupCheckpoints() {
  const storage = new Storage(process.cwd());
  const tempDir = storage.getProjectTempDir();
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if the directory doesn't exist or fails to delete.
  }
}
