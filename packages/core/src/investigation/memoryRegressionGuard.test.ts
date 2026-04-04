/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  MemoryRegressionGuard,
  type MemoryFingerprint,
  type MemoryBudget,
} from './memoryRegressionGuard.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeClasses(count: number, sizeMultiplier = 1) {
  return Array.from({ length: count }, (_, i) => ({
    className: `Class${i}`,
    count: 100 + i * 10,
    shallowSize: (1000 + i * 500) * sizeMultiplier,
    retainedSize: (5000 + i * 2000) * sizeMultiplier,
  }));
}

function makeFingerprint(
  guard: MemoryRegressionGuard,
  sizeMultiplier = 1,
  options?: { commitHash?: string; label?: string },
): MemoryFingerprint {
  const classes = makeClasses(5, sizeMultiplier);
  return guard.createFingerprint(classes, options);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MemoryRegressionGuard', () => {
  // ─── createFingerprint ─────────────────────────────────────────────────

  describe('createFingerprint', () => {
    it('should compute totalHeapSize from class retainedSize sum', () => {
      const guard = new MemoryRegressionGuard();
      const classes = [
        { className: 'A', count: 10, shallowSize: 100, retainedSize: 5000 },
        { className: 'B', count: 20, shallowSize: 200, retainedSize: 8000 },
      ];
      const fp = guard.createFingerprint(classes);
      expect(fp.totalHeapSize).toBe(13000);
    });

    it('should compute objectCount from class count sum', () => {
      const guard = new MemoryRegressionGuard();
      const classes = [
        { className: 'A', count: 10, shallowSize: 100, retainedSize: 5000 },
        { className: 'B', count: 20, shallowSize: 200, retainedSize: 8000 },
      ];
      const fp = guard.createFingerprint(classes);
      expect(fp.objectCount).toBe(30);
    });

    it('should sort classDistribution by retainedSize descending', () => {
      const guard = new MemoryRegressionGuard();
      const classes = [
        { className: 'Small', count: 10, shallowSize: 100, retainedSize: 1000 },
        { className: 'Big', count: 10, shallowSize: 100, retainedSize: 50000 },
        { className: 'Medium', count: 10, shallowSize: 100, retainedSize: 10000 },
      ];
      const fp = guard.createFingerprint(classes);
      expect(fp.classDistribution[0].className).toBe('Big');
      expect(fp.classDistribution[1].className).toBe('Medium');
      expect(fp.classDistribution[2].className).toBe('Small');
    });

    it('should compute heapShare percentages', () => {
      const guard = new MemoryRegressionGuard();
      const classes = [
        { className: 'A', count: 10, shallowSize: 100, retainedSize: 7500 },
        { className: 'B', count: 10, shallowSize: 100, retainedSize: 2500 },
      ];
      const fp = guard.createFingerprint(classes);
      expect(fp.classDistribution[0].heapShare).toBeCloseTo(75, 0);
      expect(fp.classDistribution[1].heapShare).toBeCloseTo(25, 0);
    });

    it('should handle zero total heap (heapShare = 0)', () => {
      const guard = new MemoryRegressionGuard();
      const classes = [
        { className: 'Empty', count: 0, shallowSize: 0, retainedSize: 0 },
      ];
      const fp = guard.createFingerprint(classes);
      expect(fp.totalHeapSize).toBe(0);
      expect(fp.classDistribution[0].heapShare).toBe(0);
    });

    it('should generate unique fingerprint IDs', () => {
      const guard = new MemoryRegressionGuard();
      const fp1 = makeFingerprint(guard);
      const fp2 = makeFingerprint(guard);
      expect(fp1.id).not.toBe(fp2.id);
    });

    it('should include metadata', () => {
      const guard = new MemoryRegressionGuard();
      const fp = guard.createFingerprint(makeClasses(3), {
        commitHash: 'abc123',
        label: 'test-run',
      });
      expect(fp.commitHash).toBe('abc123');
      expect(fp.meta.label).toBe('test-run');
      expect(fp.timestamp).toBeGreaterThan(0);
    });

    it('should handle empty class list', () => {
      const guard = new MemoryRegressionGuard();
      const fp = guard.createFingerprint([]);
      expect(fp.totalHeapSize).toBe(0);
      expect(fp.objectCount).toBe(0);
      expect(fp.classDistribution).toHaveLength(0);
    });
  });

  // ─── Baseline management ───────────────────────────────────────────────

  describe('baseline management', () => {
    it('should set and get baseline', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      guard.setBaseline('test-key', fp);
      const baseline = guard.getBaseline('test-key');
      expect(baseline).toBeDefined();
      expect(baseline!.fingerprint.id).toBe(fp.id);
    });

    it('should return undefined for non-existent baseline', () => {
      const guard = new MemoryRegressionGuard();
      expect(guard.getBaseline('nonexistent')).toBeUndefined();
    });

    it('should maintain history of last 20 fingerprints', () => {
      const guard = new MemoryRegressionGuard();
      const fp1 = makeFingerprint(guard, 1);
      guard.setBaseline('key', fp1);

      // Add 25 updates
      for (let i = 0; i < 25; i++) {
        const fp = makeFingerprint(guard, 1 + i * 0.01);
        guard.setBaseline('key', fp);
      }

      const baseline = guard.getBaseline('key');
      expect(baseline!.history.length).toBeLessThanOrEqual(20);
    });

    it('should store budget with baseline', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      const budget: MemoryBudget = { totalHeapMax: 100_000_000 };
      guard.setBaseline('key', fp, budget);
      const baseline = guard.getBaseline('key');
      expect(baseline!.budget?.totalHeapMax).toBe(100_000_000);
    });
  });

  // ─── checkRegression ──────────────────────────────────────────────────

  describe('checkRegression', () => {
    it('should return pass when no baseline exists', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      const result = guard.checkRegression('no-baseline', fp);
      expect(result.isRegression).toBe(false);
      expect(result.severity).toBe('pass');
      expect(result.exitCode).toBe(0);
    });

    it('should detect heap growth > 15% as failure', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);

      // 20% growth
      const current = makeFingerprint(guard, 1.20);
      const result = guard.checkRegression('key', current);
      expect(result.isRegression).toBe(true);
      expect(result.severity).toBe('failure');
      expect(result.exitCode).toBe(1);
      const heapViolation = result.violations.find(v => v.type === 'heap_growth');
      expect(heapViolation).toBeDefined();
    });

    it('should detect heap growth 5-15% as warning', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);

      // 10% growth
      const current = makeFingerprint(guard, 1.10);
      const result = guard.checkRegression('key', current);
      expect(result.isRegression).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should pass for stable heap (< 5% growth)', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);

      // 2% growth
      const current = makeFingerprint(guard, 1.02);
      const result = guard.checkRegression('key', current);
      // Small growth should not trigger heap_growth violation
      const heapViolation = result.violations.find(v => v.type === 'heap_growth');
      expect(heapViolation).toBeUndefined();
    });

    it('should detect new classes as potential retention', () => {
      const guard = new MemoryRegressionGuard();
      const baselineClasses = [
        { className: 'Existing', count: 100, shallowSize: 1000, retainedSize: 50000 },
      ];
      const baseline = guard.createFingerprint(baselineClasses);
      guard.setBaseline('key', baseline);

      const currentClasses = [
        { className: 'Existing', count: 100, shallowSize: 1000, retainedSize: 50000 },
        { className: 'NewLeak', count: 500, shallowSize: 5000, retainedSize: 200_000 },
      ];
      const current = guard.createFingerprint(currentClasses);
      const result = guard.checkRegression('key', current);

      const newRetention = result.violations.find(v => v.type === 'new_retention');
      expect(newRetention).toBeDefined();
    });

    it('should enforce budget when provided', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      const budget: MemoryBudget = { totalHeapMax: 1000 }; // very low budget
      guard.setBaseline('key', baseline, budget);

      const current = makeFingerprint(guard, 1);
      const result = guard.checkRegression('key', current);
      const budgetViolation = result.violations.find(v => v.type === 'budget_exceeded');
      expect(budgetViolation).toBeDefined();
    });

    it('should include comparison data in result', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);

      const current = makeFingerprint(guard, 1.5);
      const result = guard.checkRegression('key', current);
      expect(result.comparison).toBeDefined();
      expect(result.comparison.heapDelta).toBeGreaterThan(0);
      expect(result.comparison.heapDeltaPercent).toBeGreaterThan(0);
    });

    it('should generate summary string', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);

      const current = makeFingerprint(guard, 1.5);
      const result = guard.checkRegression('key', current);
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  // ─── analyzeTrend ─────────────────────────────────────────────────────

  describe('analyzeTrend', () => {
    it('should require at least 3 fingerprints', () => {
      const guard = new MemoryRegressionGuard();
      const fp1 = makeFingerprint(guard, 1);
      const fp2 = makeFingerprint(guard, 1.1);
      const trend = guard.analyzeTrend([fp1, fp2]);
      expect(trend.isGrowing).toBe(false);
      expect(trend.dataPoints).toBeLessThan(3);
    });

    it('should detect growing trend', () => {
      const guard = new MemoryRegressionGuard();
      const fingerprints = [
        makeFingerprint(guard, 1),
        makeFingerprint(guard, 1.5),
        makeFingerprint(guard, 2),
        makeFingerprint(guard, 2.5),
        makeFingerprint(guard, 3),
      ];
      const trend = guard.analyzeTrend(fingerprints);
      expect(trend.isGrowing).toBe(true);
      expect(trend.growthPerRun).toBeGreaterThan(0);
      expect(trend.confidence).toBeGreaterThan(0);
    });

    it('should detect stable trend', () => {
      const guard = new MemoryRegressionGuard();
      const fingerprints = [
        makeFingerprint(guard, 1),
        makeFingerprint(guard, 1),
        makeFingerprint(guard, 1),
        makeFingerprint(guard, 1),
      ];
      const trend = guard.analyzeTrend(fingerprints);
      expect(trend.growthPerRun).toBeCloseTo(0, -1);
    });

    it('should include per-class trends', () => {
      const guard = new MemoryRegressionGuard();
      const fingerprints = [
        makeFingerprint(guard, 1),
        makeFingerprint(guard, 1.5),
        makeFingerprint(guard, 2),
      ];
      const trend = guard.analyzeTrend(fingerprints);
      expect(trend.classTrends).toBeDefined();
    });
  });

  // ─── Serialization ────────────────────────────────────────────────────

  describe('exportBaselines / importBaselines', () => {
    it('should round-trip baselines through JSON', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      guard.setBaseline('test', fp);

      const json = guard.exportBaselines();
      expect(typeof json).toBe('string');

      const guard2 = new MemoryRegressionGuard();
      guard2.importBaselines(json);
      const imported = guard2.getBaseline('test');
      expect(imported).toBeDefined();
      expect(imported!.fingerprint.totalHeapSize).toBe(fp.totalHeapSize);
    });

    it('should export empty baselines', () => {
      const guard = new MemoryRegressionGuard();
      const json = guard.exportBaselines();
      expect(typeof json).toBe('string');
    });
  });

  // ─── Static formatters ────────────────────────────────────────────────

  describe('toGitHubAnnotations', () => {
    it('should produce GitHub annotation format', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = makeFingerprint(guard, 1);
      guard.setBaseline('key', baseline);
      const current = makeFingerprint(guard, 2);
      const result = guard.checkRegression('key', current);

      const annotations = MemoryRegressionGuard.toGitHubAnnotations(result);
      expect(Array.isArray(annotations)).toBe(true);
    });
  });

  describe('toCIReport', () => {
    it('should produce CI-friendly JSON report', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      const result = guard.checkRegression('no-baseline', fp);

      const report = MemoryRegressionGuard.toCIReport(result, fp);
      expect(report).toHaveProperty('passed');
      expect(report).toHaveProperty('severity');
      expect(report).toHaveProperty('exitCode');
    });
  });

  describe('formatForTerminal', () => {
    it('should produce terminal output', () => {
      const guard = new MemoryRegressionGuard();
      const fp = makeFingerprint(guard);
      const result = guard.checkRegression('no-baseline', fp);

      const output = MemoryRegressionGuard.formatForTerminal(result);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  // ─── Budget edge cases ────────────────────────────────────────────────

  describe('budget enforcement', () => {
    it('should enforce per-class instance budget', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = guard.createFingerprint([
        { className: 'LeakyClass', count: 100, shallowSize: 1000, retainedSize: 10000 },
      ]);
      const budget: MemoryBudget = {
        classBudgets: [{ className: 'LeakyClass', maxInstances: 50 }],
      };
      guard.setBaseline('key', baseline, budget);

      const current = guard.createFingerprint([
        { className: 'LeakyClass', count: 100, shallowSize: 1000, retainedSize: 10000 },
      ]);
      const result = guard.checkRegression('key', current);
      const classViolation = result.violations.find(
        v => v.type === 'budget_exceeded' && v.className === 'LeakyClass',
      );
      expect(classViolation).toBeDefined();
    });

    it('should enforce per-class retained size budget', () => {
      const guard = new MemoryRegressionGuard();
      const baseline = guard.createFingerprint([
        { className: 'BigClass', count: 10, shallowSize: 1000, retainedSize: 500_000 },
      ]);
      const budget: MemoryBudget = {
        classBudgets: [{ className: 'BigClass', maxRetainedSize: 100_000 }],
      };
      guard.setBaseline('key', baseline, budget);

      const current = guard.createFingerprint([
        { className: 'BigClass', count: 10, shallowSize: 1000, retainedSize: 500_000 },
      ]);
      const result = guard.checkRegression('key', current);
      const sizeViolation = result.violations.find(
        v => v.type === 'budget_exceeded' && v.className === 'BigClass',
      );
      expect(sizeViolation).toBeDefined();
    });
  });
});
