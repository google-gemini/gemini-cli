/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type AchievementCategory =
  | 'getting-started'
  | 'wizard'
  | 'onboarding'
  | 'suggestions'
  | 'explain'
  | 'tutorials'
  | 'workflows'
  | 'mastery';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  xp: number;
  icon: string;
  unlockCondition: (stats: PlayerStats) => boolean;
  hidden?: boolean;
}

export interface Level {
  level: number;
  xpRequired: number;
  title: string;
  description: string;
}

export interface PlayerStats {
  xp: number;
  level: number;
  achievementsUnlocked: string[];
  wizardCompleted: boolean;
  tasksCompleted: number;
  tutorialsCompleted: number;
  workflowsExecuted: number;
  suggestionsAccepted: number;
  explainModeUsed: number;
  commandsExecuted: number;
  filesCreated: number;
  daysActive: number;
  streak: number;
  lastActiveDate?: string;
}

export interface LearningPathState {
  stats: PlayerStats;
  unlockedAchievements: Set<string>;
  recentAchievements: string[];
}

export interface XPGain {
  amount: number;
  source: string;
  timestamp: number;
}

export interface LevelUpResult {
  leveled: boolean;
  oldLevel: number;
  newLevel: number;
  newTitle: string;
}
