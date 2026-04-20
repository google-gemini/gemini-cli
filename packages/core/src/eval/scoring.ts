/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Scoring utilities for the evaluation framework.
 * Grades individual scenario results and generates aggregate score cards.
 */

import type {
  EvalScenario,
  EvalResult,
  ScoreCard,
  CategoryScore,
} from './types.js';
import { computeRawScore, validateOutcome } from './harness.js';

/** Default timeout used for scoring when no scenario timeout is specified. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Scores a single evaluation result against its scenario specification.
 *
 * Weights:
 * - File changes correctness: 40%
 * - Output correctness: 30%
 * - No errors: 20%
 * - Time bonus: 10%
 *
 * @param scenario The scenario specification.
 * @param result The execution result to score.
 * @returns A score from 0 to 100.
 */
export function scoreResult(
  scenario: EvalScenario,
  result: EvalResult,
): number {
  const outcomeErrors = validateOutcome(
    scenario.expectedOutcome,
    result.output,
    result.fileChanges,
  );

  const allErrors = [...result.errors, ...outcomeErrors];
  const timeout = scenario.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return computeRawScore(
    scenario.expectedOutcome,
    result.output,
    result.fileChanges,
    allErrors,
    result.duration,
    timeout,
  );
}

/**
 * Generates an aggregate score card from a collection of scenario results.
 *
 * @param scenarios The evaluated scenarios.
 * @param results The corresponding results (must be in the same order or match by id).
 * @returns A score card with category and difficulty breakdowns.
 */
export function generateScoreCard(
  scenarios: EvalScenario[],
  results: EvalResult[],
): ScoreCard {
  const resultMap = new Map<string, EvalResult>();
  for (const result of results) {
    resultMap.set(result.scenarioId, result);
  }

  const byCategory: Record<string, CategoryScore> = {};
  const byDifficulty: Record<string, CategoryScore> = {};
  let totalScore = 0;
  let passedCount = 0;
  let totalDuration = 0;

  for (const scenario of scenarios) {
    const result = resultMap.get(scenario.id);
    if (!result) continue;

    totalScore += result.score;
    totalDuration += result.duration;
    if (result.passed) passedCount++;

    // Accumulate category scores.
    accumulateCategoryScore(byCategory, scenario.category, result);

    // Accumulate difficulty scores.
    accumulateCategoryScore(byDifficulty, scenario.difficulty, result);
  }

  const matchedCount = scenarios.filter((s) => resultMap.has(s.id)).length;

  return {
    totalScenarios: matchedCount,
    passed: passedCount,
    failed: matchedCount - passedCount,
    averageScore: matchedCount > 0 ? Math.round(totalScore / matchedCount) : 0,
    byCategory,
    byDifficulty,
    duration: totalDuration,
  };
}

/**
 * Accumulates a result into a category score bucket.
 */
function accumulateCategoryScore(
  map: Record<string, CategoryScore>,
  key: string,
  result: EvalResult,
): void {
  if (!map[key]) {
    map[key] = { total: 0, passed: 0, averageScore: 0 };
  }

  const bucket = map[key];
  const prevTotal = bucket.averageScore * bucket.total;
  bucket.total++;
  if (result.passed) bucket.passed++;
  bucket.averageScore = Math.round((prevTotal + result.score) / bucket.total);
}
