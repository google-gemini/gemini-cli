/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GraphService } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ONE_HOUR_MS = 60 * 60 * 1000;

let indexing = false;

async function runIndex(root: string): Promise<void> {
  if (indexing) return;
  indexing = true;
  const service = new GraphService(root);
  try {
    service.indexProject();
  } catch {
    // best-effort — never crash the session over auto-index
  } finally {
    service.close();
    indexing = false;
  }
}

/**
 * If .gemini/gemini.idx exists (idx is active), re-indexes in the background:
 *   1. Once immediately at session start.
 *   2. Every hour while the session is running.
 *
 * All work is fire-and-forget and the timer is unref'd so it won't
 * prevent the process from exiting normally.
 */
export function startAutoIndex(root: string): void {
  const dbPath = path.join(root, '.gemini', 'gemini.idx');
  if (!fs.existsSync(dbPath)) return; // idx not yet initialised — skip

  // Session-start index (deferred so the UI renders first)
  setImmediate(() => void runIndex(root));

  // Hourly refresh — unref so it doesn't keep the process alive
  const timer = setInterval(() => void runIndex(root), ONE_HOUR_MS);
  timer.unref();
}
