/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  ChallengeDifficulty,
  ChallengeCategory,
  Challenge,
  TestCase,
  EnvironmentConfig,
  ChallengeAttempt,
  TestResult,
  ChallengeProgress,
  PlaygroundStats,
  DailyChallenge,
} from './types.js';

export {
  PlaygroundEngine,
  getPlaygroundEngine,
  resetPlaygroundEngine,
} from './playground-engine.js';

export { CHALLENGES } from './challenges.js';
