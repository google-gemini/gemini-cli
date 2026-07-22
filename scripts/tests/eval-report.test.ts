/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findReportFiles,
  getModelFromPath,
  summarizeReports,
  formatReportSummary,
  formatReportSummaryJson,
} from '../utils/eval-report.js';
import type { InventoryResult } from '../utils/eval-inventory.js';

describe('eval-report utility', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-eval-report-test-'));
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('findReportFiles', () => {
    it('returns an empty array if directory does not exist', () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      expect(findReportFiles(nonExistent)).toEqual([]);
    });

    it('recursively finds report.json files', () => {
      const sub1 = path.join(tmpDir, 'sub1');
      const sub2 = path.join(tmpDir, 'sub2');
      fs.mkdirSync(sub1);
      fs.mkdirSync(sub2);

      fs.writeFileSync(path.join(sub1, 'report.json'), '{}');
      fs.writeFileSync(path.join(sub2, 'report.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'other.txt'), '{}');

      const found = findReportFiles(tmpDir).map((p) =>
        path.basename(path.dirname(p)),
      );
      expect(found.sort()).toEqual(['sub1', 'sub2']);
    });
  });

  describe('getModelFromPath', () => {
    it('extracts model name from eval-logs- prefix', () => {
      const reportPath = path.join(
        tmpDir,
        'eval-logs-gemini-2.5-pro-12345',
        'report.json',
      );
      expect(getModelFromPath(reportPath)).toBe('gemini-2.5-pro');
    });

    it('extracts model name from simple eval-logs- directory name without timestamp', () => {
      const reportPath = path.join(
        tmpDir,
        'eval-logs-gemini-2.5-flash',
        'report.json',
      );
      expect(getModelFromPath(reportPath)).toBe('gemini-2.5-flash');
    });

    it('falls back to GEMINI_MODEL env var if prefix is not matched', () => {
      vi.stubEnv('GEMINI_MODEL', 'env-model');
      const reportPath = path.join(tmpDir, 'some-other-folder', 'report.json');
      expect(getModelFromPath(reportPath)).toBe('env-model');
    });

    it('falls back to unknown-model if no env var or folder match exists', () => {
      const reportPath = path.join(tmpDir, 'some-other-folder', 'report.json');
      expect(getModelFromPath(reportPath)).toBe('unknown-model');
    });
  });

  describe('summarizeReports', () => {
    it('correctly parses vitest JSON and aggregates pass rate metrics by model', async () => {
      const modelDir = path.join(tmpDir, 'eval-logs-gemini-2.5-flash-999');
      fs.mkdirSync(modelDir);

      const dummyReport = {
        testResults: [
          {
            name: '/repo/evals/test-one.eval.ts',
            status: 'passed',
            assertionResults: [
              { title: 'should retrieve memory', status: 'passed' },
              { title: 'should plan task', status: 'failed' },
            ],
          },
        ],
      };

      fs.writeFileSync(
        path.join(modelDir, 'report.json'),
        JSON.stringify(dummyReport),
      );

      const mockInventory: InventoryResult = {
        totalFiles: 1,
        totalCases: 2,
        repoRoot: '/repo',
        files: [],
        cases: [
          {
            filePath: '/repo/evals/test-one.eval.ts',
            relativePath: 'evals/test-one.eval.ts',
            helperName: 'evalTest',
            baseHelperName: 'evalTest',
            policy: 'ALWAYS_PASSES',
            name: 'should retrieve memory',
            hasFiles: false,
            hasPrompt: true,
            hasAssert: true,
            toolReferences: [],
            location: { line: 1, column: 1 },
          },
          {
            filePath: '/repo/evals/test-one.eval.ts',
            relativePath: 'evals/test-one.eval.ts',
            helperName: 'evalTest',
            baseHelperName: 'evalTest',
            policy: 'USUALLY_PASSES',
            name: 'should plan task',
            hasFiles: false,
            hasPrompt: true,
            hasAssert: true,
            toolReferences: [],
            location: { line: 10, column: 1 },
          },
        ],
        diagnostics: [],
      };

      const result = await summarizeReports(tmpDir, mockInventory);

      expect(result.totalFiles).toBe(1);
      expect(result.models).toHaveLength(1);
      const modelSummary = result.models[0];
      expect(modelSummary.modelName).toBe('gemini-2.5-flash');
      expect(modelSummary.totalCases).toBe(2);
      expect(modelSummary.totalRuns).toBe(2);
      expect(modelSummary.passedRuns).toBe(1);
      expect(modelSummary.overallPassRate).toBe(0.5);

      const cases = modelSummary.cases;
      expect(cases[0].name).toBe('should plan task');
      expect(cases[0].policy).toBe('USUALLY_PASSES');
      expect(cases[0].passed).toBe(0);
      expect(cases[0].total).toBe(1);
      expect(cases[0].passRate).toBe(0.0);

      expect(cases[1].name).toBe('should retrieve memory');
      expect(cases[1].policy).toBe('ALWAYS_PASSES');
      expect(cases[1].passed).toBe(1);
      expect(cases[1].total).toBe(1);
      expect(cases[1].passRate).toBe(1.0);
    });

    it('does not collide test cases with duplicate names in different files', async () => {
      const modelDir = path.join(tmpDir, 'eval-logs-gemini-2.5-flash-999');
      fs.mkdirSync(modelDir);

      const dummyReport = {
        testResults: [
          {
            name: '/repo/evals/test-one.eval.ts',
            status: 'passed',
            assertionResults: [{ title: 'duplicate case', status: 'passed' }],
          },
          {
            name: '/repo/evals/test-two.eval.ts',
            status: 'passed',
            assertionResults: [{ title: 'duplicate case', status: 'failed' }],
          },
        ],
      };

      fs.writeFileSync(
        path.join(modelDir, 'report.json'),
        JSON.stringify(dummyReport),
      );

      const mockInventory: InventoryResult = {
        totalFiles: 2,
        totalCases: 2,
        repoRoot: '/repo',
        files: [],
        cases: [
          {
            filePath: '/repo/evals/test-one.eval.ts',
            relativePath: 'evals/test-one.eval.ts',
            helperName: 'evalTest',
            baseHelperName: 'evalTest',
            policy: 'ALWAYS_PASSES',
            name: 'duplicate case',
            hasFiles: false,
            hasPrompt: true,
            hasAssert: true,
            toolReferences: [],
            location: { line: 1, column: 1 },
          },
          {
            filePath: '/repo/evals/test-two.eval.ts',
            relativePath: 'evals/test-two.eval.ts',
            helperName: 'evalTest',
            baseHelperName: 'evalTest',
            policy: 'USUALLY_PASSES',
            name: 'duplicate case',
            hasFiles: false,
            hasPrompt: true,
            hasAssert: true,
            toolReferences: [],
            location: { line: 1, column: 1 },
          },
        ],
        diagnostics: [],
      };

      const result = await summarizeReports(tmpDir, mockInventory);

      expect(result.models).toHaveLength(1);
      const modelSummary = result.models[0];
      expect(modelSummary.totalCases).toBe(2);
      expect(modelSummary.cases).toHaveLength(2);

      const c1 = modelSummary.cases.find(
        (c) => c.filePath === '/repo/evals/test-one.eval.ts',
      )!;
      expect(c1.name).toBe('duplicate case');
      expect(c1.policy).toBe('ALWAYS_PASSES');
      expect(c1.passed).toBe(1);
      expect(c1.total).toBe(1);

      const c2 = modelSummary.cases.find(
        (c) => c.filePath === '/repo/evals/test-two.eval.ts',
      )!;
      expect(c2.name).toBe('duplicate case');
      expect(c2.policy).toBe('USUALLY_PASSES');
      expect(c2.passed).toBe(0);
      expect(c2.total).toBe(1);
    });
  });

  describe('formatReportSummary', () => {
    it('handles empty results gracefully', () => {
      const empty = { totalFiles: 0, models: [] };
      const out = formatReportSummary(empty);
      expect(out).toContain('No report data found.');
    });

    it('formats a report beautifully with correct details', () => {
      const summary = {
        totalFiles: 2,
        models: [
          {
            modelName: 'test-model',
            totalCases: 1,
            passedCount: 1,
            totalRuns: 1,
            passedRuns: 1,
            overallPassRate: 1.0,
            cases: [
              {
                name: 'should work',
                passed: 1,
                total: 1,
                passRate: 1.0,
                policy: 'ALWAYS_PASSES',
                filePath: '/repo/evals/test.eval.ts',
              },
            ],
          },
        ],
      };

      const formatted = formatReportSummary(summary, '/repo');
      expect(formatted).toContain('Model: test-model');
      expect(formatted).toContain(
        '✓ [ALWAYS_PASSES] should work — 100.0% (1/1)',
      );
      expect(formatted).toContain('[evals/test.eval.ts]');
    });
  });

  describe('formatReportSummaryJson', () => {
    it('formats deterministic JSON output', () => {
      const summary = {
        totalFiles: 1,
        models: [
          {
            modelName: 'test-model',
            totalCases: 1,
            passedCount: 1,
            totalRuns: 1,
            passedRuns: 1,
            overallPassRate: 1.0,
            cases: [
              {
                name: 'should work',
                passed: 1,
                total: 1,
                passRate: 1.0,
                policy: 'ALWAYS_PASSES',
                filePath: '/repo/evals/test.eval.ts',
              },
            ],
          },
        ],
      };

      const fixedDate = new Date('2026-07-06T00:00:00.000Z');
      const formatted = formatReportSummaryJson(summary, '/repo', fixedDate);
      const parsed = JSON.parse(formatted);

      expect(parsed.version).toBe(1);
      expect(parsed.totalFiles).toBe(1);
      expect(parsed.generated).toBe('2026-07-06T00:00:00.000Z');
      expect(parsed.models[0].modelName).toBe('test-model');
      expect(parsed.models[0].cases[0].filePath).toBe('evals/test.eval.ts');
    });
  });
});
