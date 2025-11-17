/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  LearningPath,
  ACHIEVEMENTS,
  LEVELS,
  getLearningPath,
  resetLearningPath,
} from './learning-path-engine.js';

describe('ACHIEVEMENTS', () => {
  it('should have 30+ achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  });

  it('should have unique achievement IDs', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ACHIEVEMENTS.length);
  });

  it('should have all required fields', () => {
    ACHIEVEMENTS.forEach((achievement) => {
      expect(achievement.id).toBeTruthy();
      expect(achievement.title).toBeTruthy();
      expect(achievement.description).toBeTruthy();
      expect(achievement.category).toBeTruthy();
      expect(achievement.xp).toBeGreaterThan(0);
      expect(achievement.icon).toBeTruthy();
      expect(typeof achievement.unlockCondition).toBe('function');
    });
  });

  it('should have valid categories', () => {
    const validCategories = [
      'getting-started',
      'wizard',
      'onboarding',
      'suggestions',
      'explain',
      'tutorials',
      'workflows',
      'mastery',
    ];

    ACHIEVEMENTS.forEach((achievement) => {
      expect(validCategories).toContain(achievement.category);
    });
  });

  it('should have reasonable XP values', () => {
    ACHIEVEMENTS.forEach((achievement) => {
      expect(achievement.xp).toBeGreaterThan(0);
      expect(achievement.xp).toBeLessThanOrEqual(1000);
    });
  });

  it('should have achievements for all categories', () => {
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect(categories.size).toBeGreaterThanOrEqual(7);
  });
});

describe('LEVELS', () => {
  it('should have 10 levels', () => {
    expect(LEVELS).toHaveLength(10);
  });

  it('should start at level 1', () => {
    expect(LEVELS[0].level).toBe(1);
    expect(LEVELS[0].xpRequired).toBe(0);
  });

  it('should have increasing XP requirements', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired);
    });
  });

  it('should have sequential level numbers', () => {
    LEVELS.forEach((level, i) => {
      expect(level.level).toBe(i + 1);
    });
  });

  it('should have all required fields', () => {
    LEVELS.forEach((level) => {
      expect(level.level).toBeGreaterThan(0);
      expect(level.xpRequired).toBeGreaterThanOrEqual(0);
      expect(level.title).toBeTruthy();
      expect(level.description).toBeTruthy();
    });
  });
});

describe('LearningPath', () => {
  let tempDir: string;
  let learningPath: LearningPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-test-'));
    const statePath = path.join(tempDir, 'state.json');
    learningPath = new LearningPath(statePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should start at level 1 with 0 XP', () => {
      const stats = learningPath.getStats();
      expect(stats.level).toBe(1);
      expect(stats.xp).toBe(0);
    });

    it('should have no achievements unlocked', () => {
      const stats = learningPath.getStats();
      expect(stats.achievementsUnlocked).toEqual([]);
    });

    it('should have all stats at 0', () => {
      const stats = learningPath.getStats();
      expect(stats.wizardCompleted).toBe(false);
      expect(stats.tasksCompleted).toBe(0);
      expect(stats.tutorialsCompleted).toBe(0);
      expect(stats.workflowsExecuted).toBe(0);
      expect(stats.suggestionsAccepted).toBe(0);
      expect(stats.explainModeUsed).toBe(0);
      expect(stats.commandsExecuted).toBe(0);
      expect(stats.filesCreated).toBe(0);
      expect(stats.daysActive).toBe(0);
      expect(stats.streak).toBe(0);
    });
  });

  describe('addXP', () => {
    it('should add XP to total', () => {
      learningPath.addXP(50, 'test');
      const stats = learningPath.getStats();
      expect(stats.xp).toBe(50);
    });

    it('should track XP source', () => {
      learningPath.addXP(50, 'test-source');
      const history = learningPath.getXPHistory(1);
      expect(history[0].amount).toBe(50);
      expect(history[0].source).toBe('test-source');
    });

    it('should level up when reaching threshold', () => {
      const result = learningPath.addXP(100, 'test');
      expect(result.leveled).toBe(true);
      expect(result.oldLevel).toBe(1);
      expect(result.newLevel).toBe(2);
      expect(result.newTitle).toBe('Beginner');
    });

    it('should not level up when below threshold', () => {
      const result = learningPath.addXP(50, 'test');
      expect(result.leveled).toBe(false);
      expect(result.oldLevel).toBe(1);
      expect(result.newLevel).toBe(1);
    });

    it('should level up multiple levels at once', () => {
      const result = learningPath.addXP(5000, 'test');
      expect(result.leveled).toBe(true);
      expect(result.newLevel).toBeGreaterThan(5);
    });
  });

  describe('level progression', () => {
    it('should get current level info', () => {
      const level = learningPath.getLevel();
      expect(level.level).toBe(1);
      expect(level.title).toBe('Novice');
    });

    it('should get next level info', () => {
      const nextLevel = learningPath.getNextLevel();
      expect(nextLevel?.level).toBe(2);
      expect(nextLevel?.title).toBe('Beginner');
    });

    it('should return undefined for next level at max', () => {
      learningPath.addXP(15000, 'test');
      const nextLevel = learningPath.getNextLevel();
      expect(nextLevel).toBeUndefined();
    });

    it('should calculate progress to next level', () => {
      learningPath.addXP(50, 'test'); // Level 1, halfway to level 2 (100 XP)
      const progress = learningPath.getProgressToNextLevel();
      expect(progress).toBe(50);
    });

    it('should return 100% at max level', () => {
      learningPath.addXP(15000, 'test');
      const progress = learningPath.getProgressToNextLevel();
      expect(progress).toBe(100);
    });
  });

  describe('achievement checking', () => {
    it('should unlock first-steps achievement', () => {
      learningPath.incrementCommandsExecuted();
      const newAchievements = learningPath.checkAchievements();

      expect(newAchievements.length).toBeGreaterThan(0);
      expect(newAchievements.some((a) => a.id === 'first-steps')).toBe(true);
    });

    it('should add XP for achievements', () => {
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();

      const stats = learningPath.getStats();
      expect(stats.xp).toBeGreaterThan(0);
    });

    it('should not unlock same achievement twice', () => {
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();
      const newAchievements = learningPath.checkAchievements();

      expect(newAchievements).toHaveLength(0);
    });

    it('should track unlocked achievements', () => {
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();

      const unlocked = learningPath.getUnlockedAchievements();
      expect(unlocked.length).toBeGreaterThan(0);
    });

    it('should track recent achievements', () => {
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();

      const recent = learningPath.getRecentAchievements();
      expect(recent.length).toBeGreaterThan(0);
    });

    it('should limit recent achievements', () => {
      // Unlock multiple achievements
      learningPath.incrementCommandsExecuted();
      learningPath.incrementWizardCompleted();
      learningPath.incrementTasksCompleted();
      learningPath.checkAchievements();

      const recent = learningPath.getRecentAchievements(2);
      expect(recent.length).toBeLessThanOrEqual(2);
    });
  });

  describe('stat tracking', () => {
    it('should track wizard completion', () => {
      learningPath.incrementWizardCompleted();
      const stats = learningPath.getStats();
      expect(stats.wizardCompleted).toBe(true);
    });

    it('should track tasks completed', () => {
      learningPath.incrementTasksCompleted();
      learningPath.incrementTasksCompleted();
      const stats = learningPath.getStats();
      expect(stats.tasksCompleted).toBe(2);
    });

    it('should track tutorials completed', () => {
      learningPath.incrementTutorialsCompleted();
      const stats = learningPath.getStats();
      expect(stats.tutorialsCompleted).toBe(1);
    });

    it('should track workflows executed', () => {
      learningPath.incrementWorkflowsExecuted();
      const stats = learningPath.getStats();
      expect(stats.workflowsExecuted).toBe(1);
    });

    it('should track suggestions accepted', () => {
      learningPath.incrementSuggestionsAccepted();
      const stats = learningPath.getStats();
      expect(stats.suggestionsAccepted).toBe(1);
    });

    it('should track explain mode usage', () => {
      learningPath.incrementExplainModeUsed();
      const stats = learningPath.getStats();
      expect(stats.explainModeUsed).toBe(1);
    });

    it('should track commands executed', () => {
      learningPath.incrementCommandsExecuted();
      const stats = learningPath.getStats();
      expect(stats.commandsExecuted).toBe(1);
    });

    it('should track files created', () => {
      learningPath.incrementFilesCreated();
      const stats = learningPath.getStats();
      expect(stats.filesCreated).toBe(1);
    });
  });

  describe('streak tracking', () => {
    it('should start streak on first update', () => {
      learningPath.updateStreak();
      const stats = learningPath.getStats();
      expect(stats.streak).toBe(1);
      expect(stats.daysActive).toBe(1);
    });

    it('should not increment streak on same day', () => {
      learningPath.updateStreak();
      learningPath.updateStreak();
      const stats = learningPath.getStats();
      expect(stats.streak).toBe(1);
      expect(stats.daysActive).toBe(1);
    });

    it('should maintain last active date', () => {
      learningPath.updateStreak();
      const stats = learningPath.getStats();
      const today = new Date().toISOString().split('T')[0];
      expect(stats.lastActiveDate).toBe(today);
    });
  });

  describe('achievement queries', () => {
    it('should get achievement by ID', () => {
      const achievement = learningPath.getAchievement('first-steps');
      expect(achievement).toBeDefined();
      expect(achievement?.title).toBe('First Steps');
    });

    it('should return undefined for non-existent achievement', () => {
      const achievement = learningPath.getAchievement('non-existent');
      expect(achievement).toBeUndefined();
    });

    it('should get locked achievements', () => {
      const locked = learningPath.getLockedAchievements();
      expect(locked.length).toBeGreaterThan(0);
      expect(locked.every((a) => !a.hidden)).toBe(true);
    });

    it('should exclude hidden achievements from locked list', () => {
      const locked = learningPath.getLockedAchievements();
      const hasHidden = locked.some((a) => a.hidden);
      expect(hasHidden).toBe(false);
    });
  });

  describe('XP history', () => {
    it('should track XP history', () => {
      learningPath.addXP(50, 'source1');
      learningPath.addXP(30, 'source2');

      const history = learningPath.getXPHistory();
      expect(history).toHaveLength(2);
    });

    it('should limit XP history', () => {
      for (let i = 0; i < 20; i++) {
        learningPath.addXP(10, `source${i}`);
      }

      const history = learningPath.getXPHistory(5);
      expect(history).toHaveLength(5);
    });

    it('should include timestamps in history', () => {
      learningPath.addXP(50, 'test');
      const history = learningPath.getXPHistory();
      expect(history[0].timestamp).toBeDefined();
      expect(history[0].timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('reset', () => {
    it('should reset all stats', () => {
      learningPath.addXP(500, 'test');
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();

      learningPath.reset();
      const stats = learningPath.getStats();

      expect(stats.xp).toBe(0);
      expect(stats.level).toBe(1);
      expect(stats.achievementsUnlocked).toEqual([]);
      expect(stats.commandsExecuted).toBe(0);
    });

    it('should clear XP history', () => {
      learningPath.addXP(50, 'test');
      learningPath.reset();

      const history = learningPath.getXPHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('should persist state to file', () => {
      learningPath.addXP(100, 'test');
      learningPath.incrementCommandsExecuted();

      const statePath = path.join(tempDir, 'state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(data.stats.xp).toBe(100);
      expect(data.stats.commandsExecuted).toBe(1);
    });

    it('should load state from file', () => {
      learningPath.addXP(200, 'test');
      learningPath.incrementTasksCompleted();

      const statePath = path.join(tempDir, 'state.json');
      const newLearningPath = new LearningPath(statePath);
      const stats = newLearningPath.getStats();

      expect(stats.xp).toBe(200);
      expect(stats.tasksCompleted).toBe(1);
    });

    it('should persist achievements', () => {
      learningPath.incrementCommandsExecuted();
      learningPath.checkAchievements();

      const statePath = path.join(tempDir, 'state.json');
      const newLearningPath = new LearningPath(statePath);
      const unlocked = newLearningPath.getUnlockedAchievements();

      expect(unlocked.length).toBeGreaterThan(0);
    });
  });
});

describe('getLearningPath', () => {
  afterEach(() => {
    resetLearningPath();
  });

  it('should return singleton instance', () => {
    const lp1 = getLearningPath();
    const lp2 = getLearningPath();
    expect(lp1).toBe(lp2);
  });

  it('should create new instance after reset', () => {
    const lp1 = getLearningPath();
    resetLearningPath();
    const lp2 = getLearningPath();
    expect(lp1).not.toBe(lp2);
  });
});
