/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { compareToBaseline, detectRegressions } from '../regression.js';
import type { ScoreCard, EvalResult } from '../types.js';

function makeScoreCard(overrides: Partial<ScoreCard> = {}): ScoreCard {
  return {
    totalScenarios: 3,
    passed: 2,
    failed: 1,
    averageScore: 70,
    byCategory: {},
    byDifficulty: {},
    duration: 5000,
    ...overrides,
  };
}

function makeResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    scenarioId: 'test',
    passed: true,
    score: 80,
    duration: 1000,
    output: '',
    fileChanges: {},
    errors: [],
    ...overrides,
  };
}

describe('compareToBaseline', () => {
  it('should identify improved scenarios', () => {
    const currentResults = [makeResult({ scenarioId: 'a', score: 90 })];
    const baselineResults = [makeResult({ scenarioId: 'a', score: 70 })];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.improved).toContain('a');
    expect(comparison.regressed).toHaveLength(0);
  });

  it('should identify regressed scenarios', () => {
    const currentResults = [makeResult({ scenarioId: 'a', score: 50 })];
    const baselineResults = [makeResult({ scenarioId: 'a', score: 80 })];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.regressed).toContain('a');
    expect(comparison.improved).toHaveLength(0);
  });

  it('should identify unchanged scenarios within threshold', () => {
    const currentResults = [makeResult({ scenarioId: 'a', score: 82 })];
    const baselineResults = [makeResult({ scenarioId: 'a', score: 80 })];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.unchanged).toContain('a');
  });

  it('should identify new scenarios', () => {
    const currentResults = [
      makeResult({ scenarioId: 'a', score: 90 }),
      makeResult({ scenarioId: 'b', score: 80 }),
    ];
    const baselineResults = [makeResult({ scenarioId: 'a', score: 85 })];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.newScenarios).toContain('b');
  });

  it('should identify removed scenarios', () => {
    const currentResults = [makeResult({ scenarioId: 'a', score: 90 })];
    const baselineResults = [
      makeResult({ scenarioId: 'a', score: 85 }),
      makeResult({ scenarioId: 'b', score: 70 }),
    ];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.removedScenarios).toContain('b');
  });

  it('should handle complex multi-scenario comparisons', () => {
    const currentResults = [
      makeResult({ scenarioId: 'improved', score: 95 }),
      makeResult({ scenarioId: 'regressed', score: 30 }),
      makeResult({ scenarioId: 'unchanged', score: 78 }),
      makeResult({ scenarioId: 'new-one', score: 85 }),
    ];
    const baselineResults = [
      makeResult({ scenarioId: 'improved', score: 60 }),
      makeResult({ scenarioId: 'regressed', score: 80 }),
      makeResult({ scenarioId: 'unchanged', score: 75 }),
      makeResult({ scenarioId: 'removed-one', score: 70 }),
    ];

    const comparison = compareToBaseline(
      makeScoreCard(),
      currentResults,
      makeScoreCard(),
      baselineResults,
    );

    expect(comparison.improved).toContain('improved');
    expect(comparison.regressed).toContain('regressed');
    expect(comparison.unchanged).toContain('unchanged');
    expect(comparison.newScenarios).toContain('new-one');
    expect(comparison.removedScenarios).toContain('removed-one');
  });
});

describe('detectRegressions', () => {
  it('should return regression warnings', () => {
    const comparison = {
      improved: [],
      regressed: ['scenario-a', 'scenario-b'],
      unchanged: [],
      newScenarios: [],
      removedScenarios: [],
    };

    const warnings = detectRegressions(comparison);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('REGRESSION');
    expect(warnings[0]).toContain('2');
  });

  it('should include score details when results are provided', () => {
    const comparison = {
      improved: [],
      regressed: ['scenario-a'],
      unchanged: [],
      newScenarios: [],
      removedScenarios: [],
    };
    const currentResults = [
      makeResult({ scenarioId: 'scenario-a', score: 40 }),
    ];
    const baselineResults = [
      makeResult({ scenarioId: 'scenario-a', score: 80 }),
    ];

    const warnings = detectRegressions(
      comparison,
      currentResults,
      baselineResults,
    );

    expect(warnings.some((w) => w.includes('80') && w.includes('40'))).toBe(
      true,
    );
  });

  it('should warn about removed scenarios', () => {
    const comparison = {
      improved: [],
      regressed: [],
      unchanged: [],
      newScenarios: [],
      removedScenarios: ['old-scenario'],
    };

    const warnings = detectRegressions(comparison);

    expect(warnings.some((w) => w.includes('WARNING'))).toBe(true);
    expect(warnings.some((w) => w.includes('old-scenario'))).toBe(true);
  });

  it('should report improvements', () => {
    const comparison = {
      improved: ['better-scenario'],
      regressed: [],
      unchanged: [],
      newScenarios: [],
      removedScenarios: [],
    };

    const warnings = detectRegressions(comparison);

    expect(warnings.some((w) => w.includes('IMPROVED'))).toBe(true);
  });

  it('should report new scenarios', () => {
    const comparison = {
      improved: [],
      regressed: [],
      unchanged: [],
      newScenarios: ['brand-new'],
      removedScenarios: [],
    };

    const warnings = detectRegressions(comparison);

    expect(warnings.some((w) => w.includes('NEW'))).toBe(true);
  });

  it('should return empty array when everything is unchanged', () => {
    const comparison = {
      improved: [],
      regressed: [],
      unchanged: ['stable-1', 'stable-2'],
      newScenarios: [],
      removedScenarios: [],
    };

    const warnings = detectRegressions(comparison);

    expect(warnings).toHaveLength(0);
  });
});
