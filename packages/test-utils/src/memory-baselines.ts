/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Baseline entry for a single memory test scenario.
 */
export interface MemoryBaseline {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  timestamp: string;
}

/**
 * Top-level structure of the baselines JSON file.
 */
export interface MemoryBaselineFile {
  version: number;
  updatedAt: string;
  scenarios: Record<string, MemoryBaseline>;
}

/**
 * Load baselines from a JSON file.
 * Returns an empty baseline file if the file does not exist yet.
 */
export function loadBaselines(path: string): MemoryBaselineFile {
  if (!existsSync(path)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      scenarios: {},
    };
  }

  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as MemoryBaselineFile;
}

/**
 * Save baselines to a JSON file.
 */
export function saveBaselines(
  path: string,
  baselines: MemoryBaselineFile,
): void {
  baselines.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(baselines, null, 2) + '\n');
}

/**
 * Update (or create) a single scenario baseline in the file.
 */
export function updateBaseline(
  path: string,
  scenarioName: string,
  measured: {
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
    externalBytes: number;
  },
): void {
  const baselines = loadBaselines(path);
  baselines.scenarios[scenarioName] = {
    heapUsedBytes: measured.heapUsedBytes,
    heapTotalBytes: measured.heapTotalBytes,
    rssBytes: measured.rssBytes,
    externalBytes: measured.externalBytes,
    timestamp: new Date().toISOString(),
  };
  saveBaselines(path, baselines);
}

/**
 * Resolve the path to the correct memory baselines JSON file.
 *
 * - If `machineFamily` is provided → returns `<testRootDir>/baselines/<machineFamily>.json`.
 *   This file may not exist yet; the harness will hard-fail at assertion time if it doesn't.
 * - If `machineFamily` is absent → returns `<testRootDir>/baselines.json`
 *   (the legacy generic file used for local development).
 *
 * @param testRootDir - Absolute path to the directory containing the test root
 *   (e.g. `__dirname` inside `memory-tests/`).
 * @param machineFamily - Optional CI runner label (e.g. `'gemini-cli-ubuntu-16-core'`).
 */
export function resolveMemoryBaselinesPath(
  testRootDir: string,
  machineFamily?: string,
): string {
  if (machineFamily) {
    return join(testRootDir, 'baselines', `${machineFamily}.json`);
  }
  return join(testRootDir, 'baselines.json');
}
