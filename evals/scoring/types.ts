/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalCategory } from '../categories.js';
import type { EvalPolicy } from '../test-helper.js';

/** Metadata written to the registry file for each registered eval. */
export interface EvalRegistryEntry {
  name: string;
  category: EvalCategory | 'uncategorized';
  tags: string[];
  policy: EvalPolicy;
}

/** Result record for a single scenario in one run. */
export interface ScenarioResult {
  name: string;
  category: EvalCategory | 'uncategorized';
  tags: string[];
  policy: EvalPolicy;
  passed: boolean;
  skipped: boolean;
  durationMs: number;
}

/** Pass/fail/skip counts for a single category. */
export interface CategorySummary {
  pass: number;
  fail: number;
  skip: number;
  passRate: number;
}

/** Aggregated summary for a complete evaluation run. */
export interface RunSummary {
  runId: string;
  timestamp: string;
  totalPass: number;
  totalFail: number;
  totalSkip: number;
  passRate: number;
  byCategory: Record<string, CategorySummary>;
  scenarios: ScenarioResult[];
}
