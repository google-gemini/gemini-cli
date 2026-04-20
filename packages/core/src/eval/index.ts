/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Barrel exports for the behavioral evaluation test framework.
 */

export type {
  EvalScenario,
  ExpectedOutcome,
  FileChange,
  EvalResult,
  ScoreCard,
  CategoryScore,
  BaselineComparison,
} from './types.js';
export { EvalHarness, validateOutcome, computeRawScore } from './harness.js';
export type { HarnessOptions } from './harness.js';
export { scoreResult, generateScoreCard } from './scoring.js';
export { generateMarkdown, generateJSON } from './reporter.js';
export { compareToBaseline, detectRegressions } from './regression.js';
export {
  allScenarios,
  debuggingScenarios,
  refactoringScenarios,
  newFeaturesScenarios,
  codeReviewScenarios,
  documentationScenarios,
  getScenariosByCategory,
  getScenariosByDifficulty,
  getScenariosByTag,
  getScenarioById,
} from './scenarios/index.js';
