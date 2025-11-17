/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  PlayerStats,
  LearningPathState,
  Achievement,
  Level,
  XPGain,
  LevelUpResult,
} from './types.js';
import { ACHIEVEMENTS } from './achievements.js';
import { LEVELS } from './levels.js';

function getLearningPathStatePath(): string {
  return path.join(os.homedir(), '.gemini-cli', 'learning-path.json');
}

export class LearningPath {
  private state: LearningPathState;
  private statePath: string;
  private xpHistory: XPGain[] = [];

  constructor(statePath?: string) {
    this.statePath = statePath || getLearningPathStatePath();
    this.state = this.loadState();
  }

  getStats(): PlayerStats {
    return { ...this.state.stats };
  }

  getLevel(): Level {
    return LEVELS.find((l) => l.level === this.state.stats.level) || LEVELS[0];
  }

  getNextLevel(): Level | undefined {
    return LEVELS.find((l) => l.level === this.state.stats.level + 1);
  }

  getProgressToNextLevel(): number {
    const currentLevel = this.getLevel();
    const nextLevel = this.getNextLevel();

    if (!nextLevel) return 100;

    const currentXP = this.state.stats.xp;
    const xpIntoLevel = currentXP - currentLevel.xpRequired;
    const xpNeededForNext = nextLevel.xpRequired - currentLevel.xpRequired;

    return Math.min(100, (xpIntoLevel / xpNeededForNext) * 100);
  }

  addXP(amount: number, source: string): LevelUpResult {
    const oldLevel = this.state.stats.level;
    this.state.stats.xp += amount;

    this.xpHistory.push({
      amount,
      source,
      timestamp: Date.now(),
    });

    // Check for level up
    const newLevel = this.calculateLevel(this.state.stats.xp);
    const leveled = newLevel > oldLevel;

    if (leveled) {
      this.state.stats.level = newLevel;
    }

    this.saveState();

    const levelInfo = this.getLevel();
    return {
      leveled,
      oldLevel,
      newLevel,
      newTitle: levelInfo.title,
    };
  }

  private calculateLevel(xp: number): number {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].xpRequired) {
        return LEVELS[i].level;
      }
    }
    return 1;
  }

  checkAchievements(): Achievement[] {
    const newAchievements: Achievement[] = [];

    for (const achievement of ACHIEVEMENTS) {
      if (this.state.unlockedAchievements.has(achievement.id)) {
        continue;
      }

      if (achievement.unlockCondition(this.state.stats)) {
        this.state.unlockedAchievements.add(achievement.id);
        this.state.stats.achievementsUnlocked.push(achievement.id);
        this.state.recentAchievements.unshift(achievement.id);

        // Add achievement XP
        this.addXP(achievement.xp, `achievement:${achievement.id}`);

        newAchievements.push(achievement);
      }
    }

    if (newAchievements.length > 0) {
      this.saveState();
    }

    return newAchievements;
  }

  getAchievement(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find((a) => a.id === id);
  }

  getUnlockedAchievements(): Achievement[] {
    return ACHIEVEMENTS.filter((a) => this.state.unlockedAchievements.has(a.id));
  }

  getLockedAchievements(): Achievement[] {
    return ACHIEVEMENTS.filter(
      (a) => !this.state.unlockedAchievements.has(a.id) && !a.hidden,
    );
  }

  getRecentAchievements(limit: number = 5): Achievement[] {
    return this.state.recentAchievements
      .slice(0, limit)
      .map((id) => this.getAchievement(id))
      .filter((a): a is Achievement => a !== undefined);
  }

  // Stat tracking methods
  incrementWizardCompleted(): void {
    this.state.stats.wizardCompleted = true;
    this.checkAchievements();
    this.saveState();
  }

  incrementTasksCompleted(): void {
    this.state.stats.tasksCompleted++;
    this.checkAchievements();
    this.saveState();
  }

  incrementTutorialsCompleted(): void {
    this.state.stats.tutorialsCompleted++;
    this.checkAchievements();
    this.saveState();
  }

  incrementWorkflowsExecuted(): void {
    this.state.stats.workflowsExecuted++;
    this.checkAchievements();
    this.saveState();
  }

  incrementSuggestionsAccepted(): void {
    this.state.stats.suggestionsAccepted++;
    this.checkAchievements();
    this.saveState();
  }

  incrementExplainModeUsed(): void {
    this.state.stats.explainModeUsed++;
    this.checkAchievements();
    this.saveState();
  }

  incrementCommandsExecuted(): void {
    this.state.stats.commandsExecuted++;
    this.checkAchievements();
    this.saveState();
  }

  incrementFilesCreated(): void {
    this.state.stats.filesCreated++;
    this.checkAchievements();
    this.saveState();
  }

  updateStreak(): void {
    const today = new Date().toISOString().split('T')[0];
    const lastActive = this.state.stats.lastActiveDate;

    if (lastActive === today) {
      return; // Already active today
    }

    if (lastActive) {
      const lastDate = new Date(lastActive);
      const todayDate = new Date(today);
      const diffDays = Math.floor(
        (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        // Consecutive day
        this.state.stats.streak++;
      } else if (diffDays > 1) {
        // Streak broken
        this.state.stats.streak = 1;
      }
    } else {
      this.state.stats.streak = 1;
    }

    this.state.stats.lastActiveDate = today;
    this.state.stats.daysActive++;
    this.checkAchievements();
    this.saveState();
  }

  getXPHistory(limit?: number): XPGain[] {
    return limit ? this.xpHistory.slice(0, limit) : [...this.xpHistory];
  }

  reset(): void {
    this.state = this.getDefaultState();
    this.xpHistory = [];
    this.saveState();
  }

  private getDefaultState(): LearningPathState {
    return {
      stats: {
        xp: 0,
        level: 1,
        achievementsUnlocked: [],
        wizardCompleted: false,
        tasksCompleted: 0,
        tutorialsCompleted: 0,
        workflowsExecuted: 0,
        suggestionsAccepted: 0,
        explainModeUsed: 0,
        commandsExecuted: 0,
        filesCreated: 0,
        daysActive: 0,
        streak: 0,
      },
      unlockedAchievements: new Set(),
      recentAchievements: [],
    };
  }

  private loadState(): LearningPathState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        return {
          stats: data.stats,
          unlockedAchievements: new Set(data.stats.achievementsUnlocked || []),
          recentAchievements: data.recentAchievements || [],
        };
      }
    } catch (error) {
      console.error('Failed to load learning path state:', error);
    }
    return this.getDefaultState();
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        stats: this.state.stats,
        recentAchievements: this.state.recentAchievements,
      };

      fs.writeFileSync(this.statePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save learning path state:', error);
    }
  }
}

let learningPathInstance: LearningPath | null = null;

export function getLearningPath(): LearningPath {
  if (!learningPathInstance) {
    learningPathInstance = new LearningPath();
  }
  return learningPathInstance;
}

export function resetLearningPath(): void {
  learningPathInstance = null;
}
