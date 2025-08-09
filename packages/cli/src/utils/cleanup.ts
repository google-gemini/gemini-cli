/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectTempDir } from '@google/gemini-cli-core';

const cleanupFunctions: Array<(() => void) | (() => Promise<void>)> = [];

export function registerCleanup(fn: (() => void) | (() => Promise<void>)) {
  cleanupFunctions.push(fn);
}

export async function runExitCleanup() {
  for (const fn of cleanupFunctions) {
    try {
      await fn();
    } catch (_) {
      // Ignore errors during cleanup.
    }
  }
  cleanupFunctions.length = 0; // Clear the array
}

export async function cleanupCheckpoints() {
  const tempDir = getProjectTempDir(process.cwd());
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if the directory doesn't exist or fails to delete.
  }
}
