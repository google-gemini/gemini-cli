/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { scoreResult, generateScoreCard } from '../scoring.js';
import type { EvalScenario, EvalResult } from '../types.js';

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    category: 'debugging',
    difficulty: 'easy',
    description: 'A test scenario.',
    setupFiles: {},
    prompt: 'Fix the bug.',
    expectedOutcome: {},
    ...overrides,
  };
}

function makeResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    scenarioId: 'test-scenario',
    passed: true,
    score: 80,
    duration: 1000,
    output: '',
    fileChanges: {},
    errors: [],
    ...overrides,
  };
}

describe('scoreResult', () => {
  it('should return a high score for a clean result with no expected outcomes', () => {
    const scenario = makeScenario();
    const result = makeResult({ errors: [], duration: 1000 });

    const score = scoreResult(scenario, result);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('should penalize output mismatches', () => {
    const scenario = makeScenario({
      expectedOutcome: {
        outputContains: ['fixed', 'resolved'],
      },
    });
    const result = makeResult({ output: 'nothing relevant' });

    const score = scoreResult(scenario, result);
    expect(score).toBeLessThan(90);
  });

  it('should penalize missing file changes', () => {
    const scenario = makeScenario({
      expectedOutcome: {
        fileChanges: [
          {
            path: 'src/main.ts',
            shouldExist: true,
            contentContains: ['fixed'],
          },
        ],
      },
    });
    const result = makeResult({ fileChanges: {} });

    const score = scoreResult(scenario, result);
    expect(score).toBeLessThan(80);
  });

  it('should return score based on execution errors', () => {
    const scenario = makeScenario();
    const withErrors = makeResult({
      errors: ['Something broke'],
      duration: 1000,
    });
    const noErrors = makeResult({ errors: [], duration: 1000 });

    const scoreWithErrors = scoreResult(scenario, withErrors);
    const scoreNoErrors = scoreResult(scenario, noErrors);
    expect(scoreNoErrors).toBeGreaterThan(scoreWithErrors);
  });
});

describe('generateScoreCard', () => {
  it('should generate a score card with correct totals', () => {
    const scenarios = [
      makeScenario({ id: 'a', category: 'debugging', difficulty: 'easy' }),
      makeScenario({ id: 'b', category: 'refactoring', difficulty: 'medium' }),
      makeScenario({ id: 'c', category: 'debugging', difficulty: 'easy' }),
    ];
    const results = [
      makeResult({ scenarioId: 'a', passed: true, score: 90, duration: 100 }),
      makeResult({ scenarioId: 'b', passed: false, score: 40, duration: 200 }),
      makeResult({ scenarioId: 'c', passed: true, score: 80, duration: 150 }),
    ];

    const card = generateScoreCard(scenarios, results);

    expect(card.totalScenarios).toBe(3);
    expect(card.passed).toBe(2);
    expect(card.failed).toBe(1);
    expect(card.averageScore).toBe(70);
    expect(card.duration).toBe(450);
  });

  it('should break down by category', () => {
    const scenarios = [
      makeScenario({ id: 'a', category: 'debugging' }),
      makeScenario({ id: 'b', category: 'refactoring' }),
      makeScenario({ id: 'c', category: 'debugging' }),
    ];
    const results = [
      makeResult({ scenarioId: 'a', passed: true, score: 90, duration: 100 }),
      makeResult({ scenarioId: 'b', passed: false, score: 40, duration: 200 }),
      makeResult({ scenarioId: 'c', passed: true, score: 80, duration: 150 }),
    ];

    const card = generateScoreCard(scenarios, results);

    expect(card.byCategory['debugging'].total).toBe(2);
    expect(card.byCategory['debugging'].passed).toBe(2);
    expect(card.byCategory['refactoring'].total).toBe(1);
    expect(card.byCategory['refactoring'].passed).toBe(0);
  });

  it('should break down by difficulty', () => {
    const scenarios = [
      makeScenario({ id: 'a', difficulty: 'easy' }),
      makeScenario({ id: 'b', difficulty: 'hard' }),
      makeScenario({ id: 'c', difficulty: 'easy' }),
    ];
    const results = [
      makeResult({ scenarioId: 'a', passed: true, score: 90, duration: 100 }),
      makeResult({ scenarioId: 'b', passed: false, score: 30, duration: 200 }),
      makeResult({ scenarioId: 'c', passed: true, score: 80, duration: 100 }),
    ];

    const card = generateScoreCard(scenarios, results);

    expect(card.byDifficulty['easy'].total).toBe(2);
    expect(card.byDifficulty['easy'].passed).toBe(2);
    expect(card.byDifficulty['hard'].total).toBe(1);
    expect(card.byDifficulty['hard'].passed).toBe(0);
  });

  it('should handle empty inputs', () => {
    const card = generateScoreCard([], []);

    expect(card.totalScenarios).toBe(0);
    expect(card.passed).toBe(0);
    expect(card.failed).toBe(0);
    expect(card.averageScore).toBe(0);
  });

  it('should handle mismatched scenario/result ids', () => {
    const scenarios = [makeScenario({ id: 'a' }), makeScenario({ id: 'b' })];
    const results = [
      makeResult({ scenarioId: 'a', passed: true, score: 90, duration: 100 }),
      makeResult({ scenarioId: 'c', passed: true, score: 80, duration: 100 }),
    ];

    const card = generateScoreCard(scenarios, results);

    expect(card.totalScenarios).toBe(1);
    expect(card.passed).toBe(1);
  });
});
