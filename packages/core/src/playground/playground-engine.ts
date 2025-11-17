/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  Challenge,
  ChallengeAttempt,
  ChallengeProgress,
  PlaygroundStats,
  DailyChallenge,
  TestResult,
} from './types.js';
import { CHALLENGES } from './challenges.js';

function getPlaygroundStatePath(): string {
  return path.join(os.homedir(), '.gemini-cli', 'playground.json');
}

export class PlaygroundEngine {
  private progress: Map<string, ChallengeProgress> = new Map();
  private attempts: ChallengeAttempt[] = [];
  private statePath: string;

  constructor(statePath?: string) {
    this.statePath = statePath || getPlaygroundStatePath();
    this.loadState();
  }

  getChallenges(): Challenge[] {
    return CHALLENGES;
  }

  getChallenge(id: string): Challenge | undefined {
    return CHALLENGES.find((c) => c.id === id);
  }

  getChallengesByDifficulty(difficulty: string): Challenge[] {
    return CHALLENGES.filter((c) => c.difficulty === difficulty);
  }

  getChallengesByCategory(category: string): Challenge[] {
    return CHALLENGES.filter((c) => c.category === category);
  }

  getDailyChallenge(): DailyChallenge {
    const today = new Date().toISOString().split('T')[0];
    const seed = this.hashDate(today);
    const availableChallenges = CHALLENGES.filter((c) => !this.isCompleted(c.id));
    const challenge =
      availableChallenges.length > 0
        ? availableChallenges[seed % availableChallenges.length]
        : CHALLENGES[seed % CHALLENGES.length];

    const progress = this.progress.get(challenge.id);
    const completedToday =
      progress?.firstCompletedAt &&
      new Date(progress.firstCompletedAt).toISOString().split('T')[0] === today;

    return {
      date: today,
      challengeId: challenge.id,
      bonus: 50,
      completed: completedToday || false,
    };
  }

  private hashDate(date: string): number {
    let hash = 0;
    for (let i = 0; i < date.length; i++) {
      hash = (hash << 5) - hash + date.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  startChallenge(challengeId: string): void {
    const challenge = this.getChallenge(challengeId);
    if (!challenge) throw new Error(`Challenge not found: ${challengeId}`);

    if (!this.progress.has(challengeId)) {
      this.progress.set(challengeId, {
        challengeId,
        completed: false,
        bestScore: 0,
        attempts: 0,
        hintsUsed: 0,
        solutionViewed: false,
        lastAttemptAt: Date.now(),
      });
      this.saveState();
    }
  }

  async submitSolution(
    challengeId: string,
    code: string,
  ): Promise<ChallengeAttempt> {
    const challenge = this.getChallenge(challengeId);
    if (!challenge) throw new Error(`Challenge not found: ${challengeId}`);

    const progress = this.progress.get(challengeId);
    if (!progress) {
      this.startChallenge(challengeId);
    }

    const attempt: ChallengeAttempt = {
      challengeId,
      startedAt: Date.now(),
      code,
      passed: false,
      testResults: [],
      hintsUsed: progress?.hintsUsed || 0,
      solutionViewed: progress?.solutionViewed || false,
    };

    // Run test cases
    attempt.testResults = await this.runTests(challenge, code);
    attempt.passed = attempt.testResults.every((r) => r.passed);
    attempt.submittedAt = Date.now();

    // Update progress
    const currentProgress = this.progress.get(challengeId)!;
    currentProgress.attempts++;
    currentProgress.lastAttemptAt = Date.now();

    if (attempt.passed) {
      const score = this.calculateScore(challenge, attempt, currentProgress);
      if (score > currentProgress.bestScore) {
        currentProgress.bestScore = score;
      }
      if (!currentProgress.completed) {
        currentProgress.completed = true;
        currentProgress.firstCompletedAt = Date.now();
      }
    }

    this.attempts.push(attempt);
    this.saveState();

    return attempt;
  }

  private async runTests(challenge: Challenge, code: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of challenge.testCases) {
      try {
        // Simple mock validation - in production, this would execute in a sandbox
        const actualOutput = await this.executeInSandbox(
          code,
          testCase.input,
          challenge.environment,
        );

        results.push({
          testName: testCase.name,
          passed: actualOutput.trim() === testCase.expectedOutput.trim(),
          actualOutput,
          expectedOutput: testCase.expectedOutput,
        });
      } catch (error: any) {
        results.push({
          testName: testCase.name,
          passed: false,
          actualOutput: '',
          expectedOutput: testCase.expectedOutput,
          error: error.message,
        });
      }
    }

    return results;
  }

  private async executeInSandbox(
    code: string,
    input: string,
    environment?: any,
  ): Promise<string> {
    // Mock implementation - in production, this would use a real sandbox
    // For now, just simulate basic validation
    return code.includes(input) ? input : '';
  }

  private calculateScore(
    challenge: Challenge,
    attempt: ChallengeAttempt,
    progress: ChallengeProgress,
  ): number {
    let score = challenge.points;

    // Penalty for hints used
    score -= progress.hintsUsed * 5;

    // Penalty for viewing solution
    if (progress.solutionViewed) {
      score = Math.floor(score * 0.5);
    }

    // Bonus for first try
    if (progress.attempts === 1) {
      score += 20;
    }

    return Math.max(0, score);
  }

  useHint(challengeId: string, hintIndex: number): string {
    const challenge = this.getChallenge(challengeId);
    if (!challenge) throw new Error(`Challenge not found: ${challengeId}`);

    if (hintIndex < 0 || hintIndex >= challenge.hints.length) {
      throw new Error(`Invalid hint index: ${hintIndex}`);
    }

    // Ensure progress exists before tracking hint usage
    if (!this.progress.has(challengeId)) {
      this.startChallenge(challengeId);
    }

    const progress = this.progress.get(challengeId)!;
    progress.hintsUsed = Math.max(progress.hintsUsed, hintIndex + 1);
    this.saveState();

    return challenge.hints[hintIndex];
  }

  viewSolution(challengeId: string): { solution: string; explanation: string } {
    const challenge = this.getChallenge(challengeId);
    if (!challenge) throw new Error(`Challenge not found: ${challengeId}`);

    // Ensure progress exists before marking solution as viewed
    if (!this.progress.has(challengeId)) {
      this.startChallenge(challengeId);
    }

    const progress = this.progress.get(challengeId)!;
    progress.solutionViewed = true;
    this.saveState();

    return {
      solution: challenge.solution,
      explanation: challenge.solutionExplanation,
    };
  }

  getProgress(challengeId: string): ChallengeProgress | undefined {
    return this.progress.get(challengeId);
  }

  isCompleted(challengeId: string): boolean {
    return this.progress.get(challengeId)?.completed || false;
  }

  getStats(): PlaygroundStats {
    const totalChallenges = CHALLENGES.length;
    const completedChallenges = Array.from(this.progress.values()).filter(
      (p) => p.completed,
    ).length;

    const totalPoints = Array.from(this.progress.values())
      .filter((p) => p.completed)
      .reduce((sum, p) => sum + p.bestScore, 0);

    const maxPoints = CHALLENGES.reduce((sum, c) => sum + c.points, 0);

    const completedProgress = Array.from(this.progress.values()).filter(
      (p) => p.completed,
    );
    const averageAttempts =
      completedProgress.length > 0
        ? completedProgress.reduce((sum, p) => sum + p.attempts, 0) /
          completedProgress.length
        : 0;

    const totalTimeSpent = this.attempts.reduce((sum, a) => {
      if (a.submittedAt) {
        return sum + (a.submittedAt - a.startedAt);
      }
      return sum;
    }, 0);

    const challengesByDifficulty = {
      beginner: { total: 0, completed: 0 },
      intermediate: { total: 0, completed: 0 },
      advanced: { total: 0, completed: 0 },
      expert: { total: 0, completed: 0 },
    };

    CHALLENGES.forEach((c) => {
      challengesByDifficulty[c.difficulty].total++;
      if (this.isCompleted(c.id)) {
        challengesByDifficulty[c.difficulty].completed++;
      }
    });

    const challengesByCategory: Record<string, { total: number; completed: number }> =
      {};
    CHALLENGES.forEach((c) => {
      if (!challengesByCategory[c.category]) {
        challengesByCategory[c.category] = { total: 0, completed: 0 };
      }
      challengesByCategory[c.category].total++;
      if (this.isCompleted(c.id)) {
        challengesByCategory[c.category].completed++;
      }
    });

    return {
      totalChallenges,
      completedChallenges,
      totalPoints,
      maxPoints,
      completionRate:
        totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0,
      averageAttempts,
      totalTimeSpent,
      challengesByDifficulty,
      challengesByCategory,
    };
  }

  reset(): void {
    this.progress.clear();
    this.attempts = [];
    this.saveState();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        this.progress = new Map(Object.entries(data.progress || {}));
        this.attempts = data.attempts || [];
      }
    } catch (error) {
      console.error('Failed to load playground state:', error);
    }
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        progress: Object.fromEntries(this.progress),
        attempts: this.attempts,
      };

      fs.writeFileSync(this.statePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save playground state:', error);
    }
  }
}

let engineInstance: PlaygroundEngine | null = null;

export function getPlaygroundEngine(): PlaygroundEngine {
  if (!engineInstance) {
    engineInstance = new PlaygroundEngine();
  }
  return engineInstance;
}

export function resetPlaygroundEngine(): void {
  engineInstance = null;
}
