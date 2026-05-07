/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Baseline entry for a single memory test scenario.
 */
export interface MemoryBaseline {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
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
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  },
): void {
  const baselines = loadBaselines(path);
  baselines.scenarios[scenarioName] = {
    heapUsedMB: measured.heapUsedMB,
    heapTotalMB: measured.heapTotalMB,
    rssMB: measured.rssMB,
    externalMB: measured.externalMB,
    timestamp: new Date().toISOString(),
  };
  saveBaselines(path, baselines);
}
