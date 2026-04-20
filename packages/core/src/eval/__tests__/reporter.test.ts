/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { generateMarkdown, generateJSON } from '../reporter.js';
import type { ScoreCard, EvalResult } from '../types.js';

function makeScoreCard(overrides: Partial<ScoreCard> = {}): ScoreCard {
  return {
    totalScenarios: 3,
    passed: 2,
    failed: 1,
    averageScore: 70,
    byCategory: {
      debugging: { total: 2, passed: 2, averageScore: 85 },
      refactoring: { total: 1, passed: 0, averageScore: 40 },
    },
    byDifficulty: {
      easy: { total: 2, passed: 2, averageScore: 85 },
      medium: { total: 1, passed: 0, averageScore: 40 },
    },
    duration: 5000,
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

describe('generateMarkdown', () => {
  it('should generate a valid Markdown report', () => {
    const scoreCard = makeScoreCard();
    const results = [
      makeResult({ scenarioId: 'debug-1', passed: true, score: 90 }),
      makeResult({ scenarioId: 'debug-2', passed: true, score: 80 }),
      makeResult({
        scenarioId: 'refactor-1',
        passed: false,
        score: 40,
        errors: ['File missing'],
      }),
    ];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('# Behavioral Evaluation Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('Total Scenarios | 3');
    expect(md).toContain('Passed | 2');
    expect(md).toContain('Failed | 1');
    expect(md).toContain('70/100');
  });

  it('should include category breakdown', () => {
    const scoreCard = makeScoreCard();
    const results = [makeResult()];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('## By Category');
    expect(md).toContain('debugging');
    expect(md).toContain('refactoring');
  });

  it('should include difficulty breakdown', () => {
    const scoreCard = makeScoreCard();
    const results = [makeResult()];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('## By Difficulty');
    expect(md).toContain('easy');
    expect(md).toContain('medium');
  });

  it('should include individual scenario results', () => {
    const scoreCard = makeScoreCard();
    const results = [
      makeResult({ scenarioId: 'debug-1', passed: true, score: 90 }),
      makeResult({
        scenarioId: 'refactor-1',
        passed: false,
        score: 40,
        errors: ['Missing file'],
      }),
    ];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('debug-1');
    expect(md).toContain('PASS');
    expect(md).toContain('refactor-1');
    expect(md).toContain('FAIL');
  });

  it('should include failed scenario details', () => {
    const scoreCard = makeScoreCard();
    const results = [
      makeResult({
        scenarioId: 'failed-1',
        passed: false,
        score: 30,
        errors: ['Error A', 'Error B'],
      }),
    ];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('## Failed Scenario Details');
    expect(md).toContain('failed-1');
    expect(md).toContain('Error A');
    expect(md).toContain('Error B');
  });

  it('should not include failed details section when all pass', () => {
    const scoreCard = makeScoreCard({ failed: 0 });
    const results = [
      makeResult({ scenarioId: 'pass-1', passed: true, score: 90 }),
    ];

    const md = generateMarkdown(scoreCard, results);

    expect(md).not.toContain('## Failed Scenario Details');
  });

  it('should format durations correctly', () => {
    const scoreCard = makeScoreCard({ duration: 125_000 });
    const results = [
      makeResult({ duration: 500 }),
      makeResult({ scenarioId: 's2', duration: 3500 }),
    ];

    const md = generateMarkdown(scoreCard, results);

    expect(md).toContain('500ms');
    expect(md).toContain('3.5s');
    expect(md).toContain('2m');
  });
});

describe('generateJSON', () => {
  it('should generate valid JSON', () => {
    const scoreCard = makeScoreCard();
    const results = [
      makeResult({ scenarioId: 'debug-1', score: 90, errors: [] }),
      makeResult({
        scenarioId: 'refactor-1',
        score: 40,
        errors: ['Missing file'],
      }),
    ];

    const json = generateJSON(scoreCard, results);
    const parsed = JSON.parse(json);

    expect(parsed.scoreCard).toBeDefined();
    expect(parsed.results).toHaveLength(2);
    expect(parsed.generatedAt).toBeDefined();
  });

  it('should include score card data', () => {
    const scoreCard = makeScoreCard();
    const results = [makeResult()];

    const json = generateJSON(scoreCard, results);
    const parsed = JSON.parse(json);

    expect(parsed.scoreCard.totalScenarios).toBe(3);
    expect(parsed.scoreCard.passed).toBe(2);
    expect(parsed.scoreCard.failed).toBe(1);
    expect(parsed.scoreCard.averageScore).toBe(70);
  });

  it('should include error counts in results', () => {
    const scoreCard = makeScoreCard();
    const results = [makeResult({ scenarioId: 'a', errors: ['e1', 'e2'] })];

    const json = generateJSON(scoreCard, results);
    const parsed = JSON.parse(json);

    expect(parsed.results[0].errorCount).toBe(2);
    expect(parsed.results[0].errors).toEqual(['e1', 'e2']);
  });

  it('should handle empty results', () => {
    const scoreCard = makeScoreCard({
      totalScenarios: 0,
      passed: 0,
      failed: 0,
    });
    const json = generateJSON(scoreCard, []);
    const parsed = JSON.parse(json);

    expect(parsed.results).toHaveLength(0);
  });
});
