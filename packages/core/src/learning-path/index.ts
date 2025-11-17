/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  AchievementCategory,
  Achievement,
  Level,
  PlayerStats,
  LearningPathState,
  XPGain,
  LevelUpResult,
} from './types.js';

export {
  LearningPath,
  getLearningPath,
  resetLearningPath,
} from './learning-path-engine.js';

export { ACHIEVEMENTS } from './achievements.js';
export { LEVELS } from './levels.js';
