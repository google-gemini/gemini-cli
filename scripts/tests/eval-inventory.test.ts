/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectInventory,
  formatInventoryReport,
  type InventoryResult,
} from '../utils/eval-inventory.js';
import type { EvalCaseRecord } from '../utils/eval-analysis.js';

function makeCaseRecord(
  overrides: Partial<EvalCaseRecord> = {},
): EvalCaseRecord {
  return {
    filePath: '/repo/evals/test.eval.ts',
    relativePath: 'evals/test.eval.ts',
    helperName: 'evalTest',
    baseHelperName: 'evalTest',
    policy: 'USUALLY_PASSES',
    name: 'test case',
    hasFiles: false,
    hasPrompt: true,
    location: { line: 1, column: 1 },
    ...overrides,
  };
}

describe('eval-inventory', () => {
  describe('collectInventory', () => {
    it('discovers eval files from the real evals directory', async () => {
      const repoRoot = path.resolve(import.meta.dirname, '../../');
      const result = await collectInventory(repoRoot);

      expect(result.totalFiles).toBeGreaterThanOrEqual(36);
      expect(result.totalCases).toBeGreaterThanOrEqual(90);
      expect(result.files.length).toBe(result.totalFiles);
      expect(result.cases.length).toBe(result.totalCases);

      for (const evalCase of result.cases) {
        expect(evalCase.name).toBeTruthy();
        expect(evalCase.relativePath).toBeTruthy();
        expect(evalCase.relativePath).toMatch(/^evals\//);
      }
    });

    it('returns zero counts for a directory with no eval files', async () => {
      const result = await collectInventory(import.meta.dirname);

      expect(result.totalFiles).toBe(0);
      expect(result.totalCases).toBe(0);
      expect(result.files).toEqual([]);
      expect(result.cases).toEqual([]);
    });
  });

  describe('formatInventoryReport', () => {
    it('includes summary line with correct counts', () => {
      const result: InventoryResult = {
        totalFiles: 2,
        totalCases: 3,
        files: [],
        cases: [
          makeCaseRecord({ policy: 'ALWAYS_PASSES', name: 'case-1' }),
          makeCaseRecord({ policy: 'USUALLY_PASSES', name: 'case-2' }),
          makeCaseRecord({ policy: 'USUALLY_PASSES', name: 'case-3' }),
        ],
        diagnostics: [],
      };

      const report = formatInventoryReport(result);

      expect(report).toContain('2 files · 3 cases · 0 diagnostics');
    });

    it('groups cases by policy', () => {
      const result: InventoryResult = {
        totalFiles: 1,
        totalCases: 2,
        files: [],
        cases: [
          makeCaseRecord({
            policy: 'ALWAYS_PASSES',
            name: 'stable test',
          }),
          makeCaseRecord({
            policy: 'USUALLY_PASSES',
            name: 'flaky test',
          }),
        ],
        diagnostics: [],
      };

      const report = formatInventoryReport(result);

      expect(report).toContain('By Policy');
      expect(report).toContain('ALWAYS_PASSES (1 cases)');
      expect(report).toContain('USUALLY_PASSES (1 cases)');
      expect(report).toContain('• stable test');
      expect(report).toContain('• flaky test');
    });

    it('groups cases by suite name', () => {
      const result: InventoryResult = {
        totalFiles: 1,
        totalCases: 2,
        files: [],
        cases: [
          makeCaseRecord({ suiteName: 'default', name: 'suite-test' }),
          makeCaseRecord({ name: 'no-suite-test' }),
        ],
        diagnostics: [],
      };

      const report = formatInventoryReport(result);

      expect(report).toContain('By Suite');
      expect(report).toContain('default (1 cases)');
      expect(report).toContain('(no suite) (1 cases)');
    });

    it('shows diagnostics section when diagnostics exist', () => {
      const result: InventoryResult = {
        totalFiles: 1,
        totalCases: 0,
        files: [],
        cases: [],
        diagnostics: [
          {
            severity: 'warning',
            message: 'Could not resolve policy',
            filePath: '/repo/evals/bad.eval.ts',
            location: { line: 5, column: 3 },
          },
        ],
      };

      const report = formatInventoryReport(result);

      expect(report).toContain('Diagnostics');
      expect(report).toContain('1 diagnostics');
      expect(report).toContain(
        '⚠ /repo/evals/bad.eval.ts:5:3 — Could not resolve policy',
      );
    });

    it('omits diagnostics section when there are none', () => {
      const result: InventoryResult = {
        totalFiles: 1,
        totalCases: 1,
        files: [],
        cases: [makeCaseRecord()],
        diagnostics: [],
      };

      const report = formatInventoryReport(result);

      expect(report).not.toContain('Diagnostics');
      expect(report).not.toContain('⚠');
    });

    it('includes helper name in case listing', () => {
      const result: InventoryResult = {
        totalFiles: 1,
        totalCases: 1,
        files: [],
        cases: [
          makeCaseRecord({
            helperName: 'customHelper',
            name: 'custom test',
          }),
        ],
        diagnostics: [],
      };

      const report = formatInventoryReport(result);

      expect(report).toContain('• custom test [customHelper]');
    });
  });
});
