/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  formatCoverageReport,
  type CoverageResult,
  type CoveredToolEntry,
} from '../utils/eval-coverage.js';
import { buildToolRegistry } from '../utils/tool-registry.js';
import { collectInventory } from '../utils/eval-inventory.js';
import type { InventoryResult } from '../utils/eval-inventory.js';
import type {
  EvalCaseRecord,
  EvalFileAnalysis,
} from '../utils/eval-analysis.js';

function makeCase(overrides: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    filePath: '/repo/evals/test.eval.ts',
    relativePath: 'evals/test.eval.ts',
    helperName: 'evalTest',
    baseHelperName: 'evalTest',
    policy: 'USUALLY_PASSES',
    name: 'test case',
    hasFiles: false,
    hasPrompt: true,
    toolReferences: [],
    location: { line: 1, column: 1 },
    ...overrides,
  };
}

function makeInventory(
  cases: EvalCaseRecord[],
  overrides: Partial<InventoryResult> = {},
): InventoryResult {
  return {
    totalFiles: 1,
    totalCases: cases.length,
    repoRoot: '/repo',
    files: [] as EvalFileAnalysis[],
    cases,
    diagnostics: [],
    ...overrides,
  };
}

describe('eval-coverage', () => {
  const registry = buildToolRegistry();

  describe('computeCoverage', () => {
    it('reports totals consistently with registry', () => {
      const result = computeCoverage(makeInventory([]), registry);

      expect(result.totalTools).toBe(registry.totalTools);
      expect(result.coveredCount + result.uncoveredCount).toBe(
        result.totalTools,
      );
    });

    it('marks all tools uncovered when inventory is empty', () => {
      const result = computeCoverage(makeInventory([]), registry);

      expect(result.coveredCount).toBe(0);
      expect(result.uncoveredCount).toBe(registry.totalTools);
      expect(result.covered).toEqual([]);
      expect(result.coveragePercent).toBe(0);
    });

    it('marks all tools uncovered when no eval case has tool references', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({ toolReferences: [] }),
          makeCase({ name: 'another', toolReferences: [] }),
        ]),
        registry,
      );

      expect(result.coveredCount).toBe(0);
      expect(result.uncoveredCount).toBe(registry.totalTools);
    });

    it('marks a single referenced tool as covered', () => {
      const result = computeCoverage(
        makeInventory([makeCase({ toolReferences: ['grep_search'] })]),
        registry,
      );

      expect(result.coveredCount).toBe(1);
      expect(result.covered[0].name).toBe('grep_search');
      expect(result.covered[0].totalCaseCount).toBe(1);
    });

    it('counts multiple cases referencing the same tool', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({
            relativePath: 'evals/a.eval.ts',
            toolReferences: ['grep_search'],
          }),
          makeCase({
            relativePath: 'evals/a.eval.ts',
            toolReferences: ['grep_search'],
          }),
          makeCase({
            relativePath: 'evals/b.eval.ts',
            toolReferences: ['grep_search'],
          }),
        ]),
        registry,
      );

      const grepEntry = result.covered.find((t) => t.name === 'grep_search');
      expect(grepEntry).toBeDefined();
      expect(grepEntry!.totalCaseCount).toBe(3);
      expect(grepEntry!.files).toHaveLength(2);
    });

    it('correctly builds per-file case counts', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({
            relativePath: 'evals/file-a.eval.ts',
            toolReferences: ['glob'],
          }),
          makeCase({
            relativePath: 'evals/file-a.eval.ts',
            toolReferences: ['glob'],
          }),
          makeCase({
            relativePath: 'evals/file-b.eval.ts',
            toolReferences: ['glob'],
          }),
        ]),
        registry,
      );

      const globEntry = result.covered.find((t) => t.name === 'glob');
      expect(globEntry).toBeDefined();

      const fileA = globEntry!.files.find(
        (f) => f.relativePath === 'evals/file-a.eval.ts',
      );
      const fileB = globEntry!.files.find(
        (f) => f.relativePath === 'evals/file-b.eval.ts',
      );

      expect(fileA?.caseCount).toBe(2);
      expect(fileB?.caseCount).toBe(1);
    });

    it('computes correct policy distribution per tool', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({
            policy: 'ALWAYS_PASSES',
            toolReferences: ['read_file'],
          }),
          makeCase({
            policy: 'USUALLY_PASSES',
            toolReferences: ['read_file'],
          }),
          makeCase({
            policy: 'USUALLY_PASSES',
            toolReferences: ['read_file'],
          }),
        ]),
        registry,
      );

      const readEntry = result.covered.find((t) => t.name === 'read_file');
      expect(readEntry).toBeDefined();
      expect(readEntry!.policyDistribution.ALWAYS_PASSES).toBe(1);
      expect(readEntry!.policyDistribution.USUALLY_PASSES).toBe(2);
      expect(readEntry!.policyDistribution.USUALLY_FAILS).toBeUndefined();
    });

    it('handles a case referencing multiple tools', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({
            toolReferences: ['glob', 'grep_search', 'read_file'],
          }),
        ]),
        registry,
      );

      const names = result.covered.map((t) => t.name);
      expect(names).toContain('glob');
      expect(names).toContain('grep_search');
      expect(names).toContain('read_file');
      expect(result.coveredCount).toBe(3);
    });

    it('resolves legacy aliases to canonical names', () => {
      const result = computeCoverage(
        makeInventory([makeCase({ toolReferences: ['search_file_content'] })]),
        registry,
      );

      const names = result.covered.map((t) => t.name);
      expect(names).toContain('grep_search');
      expect(names).not.toContain('search_file_content');
    });

    it('ignores unrecognized tool names silently', () => {
      const result = computeCoverage(
        makeInventory([makeCase({ toolReferences: ['nonexistent_tool_xyz'] })]),
        registry,
      );

      expect(result.covered.map((t) => t.name)).not.toContain(
        'nonexistent_tool_xyz',
      );
      expect(result.coveredCount).toBe(0);
    });

    it('sorts covered tools alphabetically', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({ toolReferences: ['write_file'] }),
          makeCase({ toolReferences: ['glob'] }),
          makeCase({ toolReferences: ['grep_search'] }),
        ]),
        registry,
      );

      const names = result.covered.map((t) => t.name);
      expect(names).toEqual([...names].sort());
    });

    it('sorts uncovered tools alphabetically', () => {
      const result = computeCoverage(makeInventory([]), registry);
      const names = result.uncovered.map((t) => t.name);
      expect(names).toEqual([...names].sort());
    });

    it('sorts files within a covered entry alphabetically', () => {
      const result = computeCoverage(
        makeInventory([
          makeCase({
            relativePath: 'evals/z-last.eval.ts',
            toolReferences: ['glob'],
          }),
          makeCase({
            relativePath: 'evals/a-first.eval.ts',
            toolReferences: ['glob'],
          }),
        ]),
        registry,
      );

      const globEntry = result.covered.find((t) => t.name === 'glob')!;
      expect(globEntry.files[0].relativePath).toBe('evals/a-first.eval.ts');
      expect(globEntry.files[1].relativePath).toBe('evals/z-last.eval.ts');
    });

    it('computes coverage percent correctly', () => {
      const totalTools = registry.totalTools;
      const halfTools = [...registry.tools.keys()].slice(
        0,
        Math.floor(totalTools / 2),
      );
      const cases = halfTools.map((name) =>
        makeCase({ toolReferences: [name] }),
      );

      const result = computeCoverage(makeInventory(cases), registry);

      const expected = Math.round((halfTools.length / totalTools) * 1000) / 10;
      expect(result.coveragePercent).toBe(expected);
    });

    it('coveragePercent is 0 for empty inventory', () => {
      const result = computeCoverage(makeInventory([]), registry);
      expect(result.coveragePercent).toBe(0);
    });

    it('resolves absolute diagnostic file paths to relative paths', () => {
      const diagnostic = {
        severity: 'warning' as const,
        message: 'Could not resolve policy',
        filePath: '/repo/evals/bad.eval.ts',
        location: { line: 5, column: 3 },
      };
      const result = computeCoverage(
        makeInventory([], { diagnostics: [diagnostic], repoRoot: '/repo' }),
        registry,
      );

      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        message: 'Could not resolve policy',
        filePath: 'evals/bad.eval.ts',
        location: { line: 5, column: 3 },
      });
    });
  });

  describe('formatCoverageReport', () => {
    function makeCoverageResult(
      overrides: Partial<CoverageResult> = {},
    ): CoverageResult {
      return {
        totalTools: 26,
        coveredCount: 0,
        uncoveredCount: 26,
        coveragePercent: 0,
        covered: [],
        uncovered: [],
        diagnostics: [],
        ...overrides,
      };
    }

    it('includes the title and summary line', () => {
      const result = makeCoverageResult({
        totalTools: 26,
        coveredCount: 10,
        uncoveredCount: 16,
        coveragePercent: 38.5,
      });

      const report = formatCoverageReport(result);

      expect(report).toContain('Eval Coverage Report');
      expect(report).toContain('10 / 26 tools covered (38.5%)');
    });

    it('includes Covered Tools section header', () => {
      const report = formatCoverageReport(makeCoverageResult());
      expect(report).toContain('Covered Tools');
    });

    it('includes Uncovered Tools section header', () => {
      const report = formatCoverageReport(makeCoverageResult());
      expect(report).toContain('Uncovered Tools');
    });

    it('shows (none) when no tools are covered', () => {
      const report = formatCoverageReport(makeCoverageResult());
      expect(report).toContain('(none)');
    });

    it('shows full-coverage message when all tools are covered', () => {
      const result = makeCoverageResult({
        coveredCount: 26,
        uncoveredCount: 0,
        uncovered: [],
      });
      const report = formatCoverageReport(result);
      expect(report).toContain('(none — full coverage!)');
    });

    it('lists covered tools with case and file counts', () => {
      const coveredEntry: CoveredToolEntry = {
        name: 'grep_search',
        category: 'file-system',
        totalCaseCount: 5,
        files: [
          {
            relativePath: 'evals/grep_search_functionality.eval.ts',
            caseCount: 5,
            policyDistribution: { USUALLY_PASSES: 5 },
          },
        ],
        policyDistribution: { USUALLY_PASSES: 5 },
      };

      const result = makeCoverageResult({
        coveredCount: 1,
        uncoveredCount: 25,
        covered: [coveredEntry],
      });

      const report = formatCoverageReport(result);

      expect(report).toContain('grep_search');
      expect(report).toContain('5 cases');
      expect(report).toContain('1 file');
      expect(report).toContain('evals/grep_search_functionality.eval.ts');
      expect(report).toContain('5 USUALLY_PASSES');
    });

    it('groups uncovered tools by category', () => {
      const result = makeCoverageResult({
        uncovered: [
          { name: 'web_fetch', category: 'web' },
          { name: 'google_web_search', category: 'web' },
          { name: 'glob', category: 'file-system' },
        ],
      });

      const report = formatCoverageReport(result);

      expect(report).toContain('[web]');
      expect(report).toContain('[file-system]');
      expect(report).toContain('web_fetch');
      expect(report).toContain('google_web_search');
      expect(report).toContain('glob');
    });

    it('does not crash when a tool has an undefined category', () => {
      const result = makeCoverageResult({
        uncovered: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { name: 'mystery_tool', category: undefined as any },
        ],
      });

      expect(() => formatCoverageReport(result)).not.toThrow();
      const report = formatCoverageReport(result);
      expect(report).toContain('mystery_tool');
    });

    it('shows diagnostics section when diagnostics exist', () => {
      const result = makeCoverageResult({
        diagnostics: [
          {
            severity: 'warning',
            message: 'Could not resolve policy',
            filePath: 'evals/bad.eval.ts',
            location: { line: 5, column: 3 },
          },
        ],
      });

      const report = formatCoverageReport(result);

      expect(report).toContain('Diagnostics');
      expect(report).toContain('⚠');
      expect(report).toContain('Could not resolve policy');
    });

    it('omits diagnostics section when there are no diagnostics', () => {
      const result = makeCoverageResult({ diagnostics: [] });
      const report = formatCoverageReport(result);
      expect(report).not.toContain('Diagnostics');
      expect(report).not.toContain('⚠');
    });

    it('shows policy distribution inside file entries', () => {
      const coveredEntry: CoveredToolEntry = {
        name: 'glob',
        category: 'file-system',
        totalCaseCount: 3,
        files: [
          {
            relativePath: 'evals/frugal.eval.ts',
            caseCount: 3,
            policyDistribution: {
              ALWAYS_PASSES: 1,
              USUALLY_PASSES: 2,
            },
          },
        ],
        policyDistribution: { ALWAYS_PASSES: 1, USUALLY_PASSES: 2 },
      };

      const result = makeCoverageResult({
        coveredCount: 1,
        covered: [coveredEntry],
      });

      const report = formatCoverageReport(result);

      expect(report).toContain('1 ALWAYS_PASSES');
      expect(report).toContain('2 USUALLY_PASSES');
    });
  });

  describe('integration — real evals directory', () => {
    it('produces a valid coverage result from the real eval suite', async () => {
      const repoRoot = path.resolve(import.meta.dirname, '../../');
      const inventory = await collectInventory(repoRoot);
      const result = computeCoverage(inventory, registry);

      expect(result.totalTools).toBe(registry.totalTools);
      expect(result.coveredCount + result.uncoveredCount).toBe(
        result.totalTools,
      );
      expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(result.coveragePercent).toBeLessThanOrEqual(100);
      expect(result.coveredCount).toBeGreaterThanOrEqual(5);

      const grepEntry = result.covered.find((t) => t.name === 'grep_search');
      expect(grepEntry).toBeDefined();
      expect(grepEntry!.totalCaseCount).toBeGreaterThanOrEqual(1);
    });

    it('formats the real coverage report without throwing', async () => {
      const repoRoot = path.resolve(import.meta.dirname, '../../');
      const inventory = await collectInventory(repoRoot);
      const result = computeCoverage(inventory, registry);
      const report = formatCoverageReport(result);

      expect(typeof report).toBe('string');
      expect(report).toContain('Eval Coverage Report');
      expect(report).toContain('Covered Tools');
      expect(report).toContain('Uncovered Tools');
    });
  });
});
