/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Baseline comparison and regression detection for evaluation results.
 */

import type { ScoreCard, BaselineComparison, EvalResult } from './types.js';

/** Threshold for score drop that constitutes a regression. */
const REGRESSION_THRESHOLD = 5;

/** Threshold for score improvement. */
const IMPROVEMENT_THRESHOLD = 5;

/**
 * Compares the current score card and results against a baseline,
 * identifying improvements, regressions, and new/removed scenarios.
 *
 * @param current The current evaluation results.
 * @param currentResults The individual results from the current run.
 * @param baseline The baseline score card to compare against.
 * @param baselineResults The individual results from the baseline run.
 * @returns A comparison summary.
 */
export function compareToBaseline(
  current: ScoreCard,
  currentResults: EvalResult[],
  baseline: ScoreCard,
  baselineResults: EvalResult[],
): BaselineComparison {
  const currentMap = new Map<string, EvalResult>();
  for (const r of currentResults) {
    currentMap.set(r.scenarioId, r);
  }

  const baselineMap = new Map<string, EvalResult>();
  for (const r of baselineResults) {
    baselineMap.set(r.scenarioId, r);
  }

  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];
  const newScenarios: string[] = [];
  const removedScenarios: string[] = [];

  // Check all current scenarios against baseline.
  for (const [id, currentResult] of currentMap) {
    const baselineResult = baselineMap.get(id);
    if (!baselineResult) {
      newScenarios.push(id);
      continue;
    }

    const delta = currentResult.score - baselineResult.score;
    if (delta >= IMPROVEMENT_THRESHOLD) {
      improved.push(id);
    } else if (delta <= -REGRESSION_THRESHOLD) {
      regressed.push(id);
    } else {
      unchanged.push(id);
    }
  }

  // Check for removed scenarios.
  for (const id of baselineMap.keys()) {
    if (!currentMap.has(id)) {
      removedScenarios.push(id);
    }
  }

  return {
    improved,
    regressed,
    unchanged,
    newScenarios,
    removedScenarios,
  };
}

/**
 * Generates human-readable regression warnings from a comparison.
 *
 * @param comparison The baseline comparison result.
 * @param currentResults Current results for detailed messages.
 * @param baselineResults Baseline results for detailed messages.
 * @returns An array of warning strings.
 */
export function detectRegressions(
  comparison: BaselineComparison,
  currentResults?: EvalResult[],
  baselineResults?: EvalResult[],
): string[] {
  const warnings: string[] = [];

  if (comparison.regressed.length > 0) {
    warnings.push(
      `REGRESSION: ${comparison.regressed.length} scenario(s) regressed from baseline.`,
    );

    if (currentResults && baselineResults) {
      const currentMap = new Map(currentResults.map((r) => [r.scenarioId, r]));
      const baselineMap = new Map(
        baselineResults.map((r) => [r.scenarioId, r]),
      );

      for (const id of comparison.regressed) {
        const current = currentMap.get(id);
        const baseline = baselineMap.get(id);
        if (current && baseline) {
          warnings.push(
            `  - ${id}: score dropped from ${baseline.score} to ${current.score} (-${baseline.score - current.score})`,
          );
        }
      }
    } else {
      for (const id of comparison.regressed) {
        warnings.push(`  - ${id}`);
      }
    }
  }

  if (comparison.removedScenarios.length > 0) {
    warnings.push(
      `WARNING: ${comparison.removedScenarios.length} scenario(s) removed from evaluation.`,
    );
    for (const id of comparison.removedScenarios) {
      warnings.push(`  - ${id}`);
    }
  }

  if (comparison.improved.length > 0) {
    warnings.push(
      `IMPROVED: ${comparison.improved.length} scenario(s) improved over baseline.`,
    );
  }

  if (comparison.newScenarios.length > 0) {
    warnings.push(
      `NEW: ${comparison.newScenarios.length} new scenario(s) added.`,
    );
  }

  return warnings;
}
