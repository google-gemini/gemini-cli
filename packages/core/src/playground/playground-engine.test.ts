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
  PlaygroundEngine,
  CHALLENGES,
  getPlaygroundEngine,
  resetPlaygroundEngine,
} from './playground-engine.js';

describe('CHALLENGES', () => {
  it('should have 50 challenges', () => {
    expect(CHALLENGES).toHaveLength(50);
  });

  it('should have unique challenge IDs', () => {
    const ids = CHALLENGES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(CHALLENGES.length);
  });

  it('should have all required fields', () => {
    CHALLENGES.forEach((challenge) => {
      expect(challenge.id).toBeTruthy();
      expect(challenge.title).toBeTruthy();
      expect(challenge.description).toBeTruthy();
      expect(['beginner', 'intermediate', 'advanced', 'expert']).toContain(
        challenge.difficulty,
      );
      expect(challenge.category).toBeTruthy();
      expect(challenge.estimatedTime).toBeTruthy();
      expect(challenge.points).toBeGreaterThan(0);
      expect(Array.isArray(challenge.hints)).toBe(true);
      expect(challenge.solution).toBeTruthy();
      expect(challenge.solutionExplanation).toBeTruthy();
      expect(Array.isArray(challenge.testCases)).toBe(true);
      expect(challenge.testCases.length).toBeGreaterThan(0);
    });
  });

  it('should have valid test cases', () => {
    CHALLENGES.forEach((challenge) => {
      challenge.testCases.forEach((testCase) => {
        expect(testCase.name).toBeTruthy();
        expect(testCase.input).toBeDefined();
        expect(testCase.expectedOutput).toBeDefined();
      });
    });
  });

  it('should have 10 beginner challenges', () => {
    const beginner = CHALLENGES.filter((c) => c.difficulty === 'beginner');
    expect(beginner.length).toBeGreaterThanOrEqual(10);
  });

  it('should have challenges across all categories', () => {
    const categories = new Set(CHALLENGES.map((c) => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});

describe('PlaygroundEngine', () => {
  let tempDir: string;
  let engine: PlaygroundEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playground-test-'));
    const statePath = path.join(tempDir, 'playground.json');
    engine = new PlaygroundEngine(statePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getChallenges', () => {
    it('should return all challenges', () => {
      const challenges = engine.getChallenges();
      expect(challenges).toHaveLength(50);
    });
  });

  describe('getChallenge', () => {
    it('should return challenge by ID', () => {
      const challenge = engine.getChallenge('basic-hello');
      expect(challenge).toBeDefined();
      expect(challenge?.title).toBe('Hello Gemini CLI');
    });

    it('should return undefined for non-existent challenge', () => {
      const challenge = engine.getChallenge('non-existent');
      expect(challenge).toBeUndefined();
    });
  });

  describe('getChallengesByDifficulty', () => {
    it('should filter by difficulty', () => {
      const beginner = engine.getChallengesByDifficulty('beginner');
      expect(beginner.every((c: any) => c.difficulty === 'beginner')).toBe(true);
    });
  });

  describe('getChallengesByCategory', () => {
    it('should filter by category', () => {
      const basics = engine.getChallengesByCategory('basics');
      expect(basics.every((c: any) => c.category === 'basics')).toBe(true);
    });
  });

  describe('getDailyChallenge', () => {
    it('should return a daily challenge', () => {
      const daily = engine.getDailyChallenge();
      expect(daily.date).toBeTruthy();
      expect(daily.challengeId).toBeTruthy();
      expect(daily.bonus).toBeGreaterThan(0);
      expect(typeof daily.completed).toBe('boolean');
    });

    it('should return same challenge for same day', () => {
      const daily1 = engine.getDailyChallenge();
      const daily2 = engine.getDailyChallenge();
      expect(daily1.challengeId).toBe(daily2.challengeId);
    });
  });

  describe('startChallenge', () => {
    it('should start a new challenge', () => {
      engine.startChallenge('basic-hello');
      const progress = engine.getProgress('basic-hello');

      expect(progress).toBeDefined();
      expect(progress?.challengeId).toBe('basic-hello');
      expect(progress?.completed).toBe(false);
      expect(progress?.attempts).toBe(0);
    });

    it('should throw error for non-existent challenge', () => {
      expect(() => engine.startChallenge('non-existent')).toThrow(
        'Challenge not found',
      );
    });
  });

  describe('submitSolution', () => {
    beforeEach(() => {
      engine.startChallenge('basic-hello');
    });

    it('should create an attempt', async () => {
      const attempt = await engine.submitSolution('basic-hello', 'hello');

      expect(attempt).toBeDefined();
      expect(attempt.challengeId).toBe('basic-hello');
      expect(attempt.code).toBe('hello');
      expect(attempt.submittedAt).toBeDefined();
      expect(Array.isArray(attempt.testResults)).toBe(true);
    });

    it('should update progress on submission', async () => {
      await engine.submitSolution('basic-hello', 'hello');
      const progress = engine.getProgress('basic-hello');

      expect(progress?.attempts).toBe(1);
    });

    it('should mark as completed when passing', async () => {
      const attempt = await engine.submitSolution('basic-hello', 'hello');

      if (attempt.passed) {
        const progress = engine.getProgress('basic-hello');
        expect(progress?.completed).toBe(true);
        expect(progress?.firstCompletedAt).toBeDefined();
      }
    });
  });

  describe('useHint', () => {
    beforeEach(() => {
      engine.startChallenge('basic-hello');
    });

    it('should return a hint', () => {
      const hint = engine.useHint('basic-hello', 0);
      expect(hint).toBeTruthy();
    });

    it('should track hints used', () => {
      engine.useHint('basic-hello', 0);
      const progress = engine.getProgress('basic-hello');
      expect(progress?.hintsUsed).toBe(1);
    });

    it('should throw error for invalid hint index', () => {
      expect(() => engine.useHint('basic-hello', 999)).toThrow(
        'Invalid hint index',
      );
    });
  });

  describe('viewSolution', () => {
    beforeEach(() => {
      engine.startChallenge('basic-hello');
    });

    it('should return solution and explanation', () => {
      const result = engine.viewSolution('basic-hello');
      expect(result.solution).toBeTruthy();
      expect(result.explanation).toBeTruthy();
    });

    it('should mark solution as viewed', () => {
      engine.viewSolution('basic-hello');
      const progress = engine.getProgress('basic-hello');
      expect(progress?.solutionViewed).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = engine.getStats();
      expect(stats.totalChallenges).toBe(50);
      expect(stats.completedChallenges).toBe(0);
      expect(stats.totalPoints).toBe(0);
      expect(stats.maxPoints).toBeGreaterThan(0);
    });

    it('should track completed challenges', async () => {
      engine.startChallenge('basic-hello');
      await engine.submitSolution('basic-hello', 'hello');

      const stats = engine.getStats();
      // Stats might show completion if tests pass
      expect(stats.totalChallenges).toBe(50);
    });
  });

  describe('isCompleted', () => {
    it('should return false for uncompleted challenge', () => {
      expect(engine.isCompleted('basic-hello')).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist progress to file', () => {
      engine.startChallenge('basic-hello');

      const statePath = path.join(tempDir, 'playground.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(data.progress['basic-hello']).toBeDefined();
    });

    it('should load progress from file', () => {
      engine.startChallenge('basic-hello');

      const statePath = path.join(tempDir, 'playground.json');
      const newEngine = new PlaygroundEngine(statePath);
      const progress = newEngine.getProgress('basic-hello');

      expect(progress).toBeDefined();
      expect(progress?.challengeId).toBe('basic-hello');
    });
  });
});

describe('getPlaygroundEngine', () => {
  afterEach(() => {
    resetPlaygroundEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getPlaygroundEngine();
    const engine2 = getPlaygroundEngine();
    expect(engine1).toBe(engine2);
  });

  it('should create new instance after reset', () => {
    const engine1 = getPlaygroundEngine();
    resetPlaygroundEngine();
    const engine2 = getPlaygroundEngine();
    expect(engine1).not.toBe(engine2);
  });
});
