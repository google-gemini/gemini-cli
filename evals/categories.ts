/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The category of a behavioral evaluation scenario.
 * Used for grouping results and computing per-category pass rates.
 */
export type EvalCategory =
  | 'debugging'
  | 'refactoring'
  | 'new-feature'
  | 'code-review'
  | 'shell-tooling'
  | 'memory'
  | 'agent-delegation';

/** Human-readable labels for each category. */
export const CATEGORY_LABELS: Record<EvalCategory, string> = {
  debugging: 'Debugging',
  refactoring: 'Refactoring',
  'new-feature': 'New Feature',
  'code-review': 'Code Review',
  'shell-tooling': 'Shell & Tooling',
  memory: 'Memory',
  'agent-delegation': 'Agent Delegation',
};

/** All defined category keys, derived from CATEGORY_LABELS to stay in sync. */
export const ALL_CATEGORIES: EvalCategory[] = Object.keys(
  CATEGORY_LABELS,
) as EvalCategory[];
