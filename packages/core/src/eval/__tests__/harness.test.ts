/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { EvalHarness, validateOutcome, computeRawScore } from '../harness.js';
import type { EvalScenario, ExpectedOutcome } from '../types.js';

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    category: 'debugging',
    difficulty: 'easy',
    description: 'A test scenario.',
    setupFiles: { 'test.txt': 'hello' },
    prompt: 'Fix the bug.',
    expectedOutcome: {},
    ...overrides,
  };
}

describe('EvalHarness', () => {
  describe('runScenario', () => {
    it('should run a scenario and return a result', async () => {
      const harness = new EvalHarness({ timeout: 5000 });
      const scenario = makeScenario();

      const result = await harness.runScenario(scenario);

      expect(result.scenarioId).toBe('test-scenario');
      expect(typeof result.score).toBe('number');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set up files in the temp directory', async () => {
      const harness = new EvalHarness({ timeout: 5000 });
      const scenario = makeScenario({
        setupFiles: {
          'src/main.ts': 'console.log("hello");',
          'src/utils/helper.ts': 'export const x = 1;',
        },
        expectedOutcome: {
          fileChanges: [
            { path: 'src/main.ts', shouldExist: true },
            { path: 'src/utils/helper.ts', shouldExist: true },
          ],
        },
      });

      const result = await harness.runScenario(scenario);

      // Files should exist and have been read back.
      expect(result.fileChanges['src/main.ts']).toBe('console.log("hello");');
      expect(result.fileChanges['src/utils/helper.ts']).toBe(
        'export const x = 1;',
      );
    });

    it('should handle scenario execution errors gracefully', async () => {
      const harness = new EvalHarness({ timeout: 5000 });
      const scenario = makeScenario({
        expectedOutcome: {
          fileChanges: [{ path: 'nonexistent.ts', shouldExist: true }],
        },
      });

      const result = await harness.runScenario(scenario);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('runAll', () => {
    it('should run all scenarios and return results', async () => {
      const harness = new EvalHarness({ concurrency: 2, timeout: 5000 });
      const scenarios = [
        makeScenario({ id: 'scenario-1' }),
        makeScenario({ id: 'scenario-2' }),
        makeScenario({ id: 'scenario-3' }),
      ];

      const results = await harness.runAll(scenarios);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.scenarioId)).toEqual([
        'scenario-1',
        'scenario-2',
        'scenario-3',
      ]);
    });

    it('should apply filter when provided', async () => {
      const harness = new EvalHarness({
        concurrency: 2,
        timeout: 5000,
        filter: (s) => s.id.includes('selected'),
      });
      const scenarios = [
        makeScenario({ id: 'selected-1' }),
        makeScenario({ id: 'skipped-1' }),
        makeScenario({ id: 'selected-2' }),
      ];

      const results = await harness.runAll(scenarios);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.scenarioId)).toEqual([
        'selected-1',
        'selected-2',
      ]);
    });
  });
});

describe('validateOutcome', () => {
  it('should return no errors when all checks pass', () => {
    const expected: ExpectedOutcome = {
      outputContains: ['success'],
      outputNotContains: ['error'],
    };

    const errors = validateOutcome(expected, 'Operation success', {});
    expect(errors).toHaveLength(0);
  });

  it('should detect missing expected output strings', () => {
    const expected: ExpectedOutcome = {
      outputContains: ['success', 'done'],
    };

    const errors = validateOutcome(expected, 'Operation complete', {});
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('success');
    expect(errors[1]).toContain('done');
  });

  it('should detect forbidden output strings', () => {
    const expected: ExpectedOutcome = {
      outputNotContains: ['error', 'failed'],
    };

    const errors = validateOutcome(expected, 'Operation failed with error', {});
    expect(errors).toHaveLength(2);
  });

  it('should validate file existence', () => {
    const expected: ExpectedOutcome = {
      fileChanges: [
        { path: 'exists.ts', shouldExist: true },
        { path: 'missing.ts', shouldExist: true },
      ],
    };

    const errors = validateOutcome(expected, '', {
      'exists.ts': 'content',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('missing.ts');
  });

  it('should validate file should not exist', () => {
    const expected: ExpectedOutcome = {
      fileChanges: [{ path: 'deleted.ts', shouldExist: false }],
    };

    const errors = validateOutcome(expected, '', {
      'deleted.ts': 'still here',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('NOT exist');
  });

  it('should validate file content contains expected strings', () => {
    const expected: ExpectedOutcome = {
      fileChanges: [
        {
          path: 'file.ts',
          shouldExist: true,
          contentContains: ['import', 'export'],
          contentNotContains: ['var'],
        },
      ],
    };

    const errors = validateOutcome(expected, '', {
      'file.ts': 'import { x } from "y";\nexport const z = 1;\nvar old = 2;',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('var');
  });
});

describe('computeRawScore', () => {
  it('should return 100 for a perfect result with no expectations', () => {
    const score = computeRawScore({}, '', {}, [], 100, 30000);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('should return low score when all checks fail', () => {
    const expected: ExpectedOutcome = {
      outputContains: ['success'],
      fileChanges: [{ path: 'file.ts', shouldExist: true }],
    };

    const score = computeRawScore(
      expected,
      'nothing useful',
      {},
      ['error 1', 'error 2'],
      50000,
      30000,
    );
    expect(score).toBeLessThan(50);
  });

  it('should give time bonus for fast completion', () => {
    const fast = computeRawScore({}, '', {}, [], 1000, 30000);
    const slow = computeRawScore({}, '', {}, [], 29000, 30000);
    expect(fast).toBeGreaterThan(slow);
  });

  it('should penalize errors', () => {
    const noErrors = computeRawScore({}, '', {}, [], 5000, 30000);
    const withErrors = computeRawScore(
      {},
      '',
      {},
      ['something went wrong'],
      5000,
      30000,
    );
    expect(noErrors).toBeGreaterThan(withErrors);
  });
});
