/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn().mockReturnValue(''),
  };
});
import {
  validateInventory,
  formatValidationReport,
  formatValidationJson,
  VALIDATION_RULES,
  type ValidationJsonOutput,
} from '../utils/eval-validate.js';
import { buildToolRegistry } from '../utils/tool-registry.js';
import type { InventoryResult } from '../utils/eval-inventory.js';
import type {
  EvalCaseRecord,
  EvalFileAnalysis,
  EvalAnalysisDiagnostic,
} from '../utils/eval-analysis.js';

function makeCase(overrides: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    filePath: '/repo/evals/test.eval.ts',
    relativePath: 'evals/test.eval.ts',
    helperName: 'evalTest',
    baseHelperName: 'evalTest',
    policy: 'USUALLY_PASSES',
    name: 'test case',
    suiteName: 'default',
    suiteType: 'behavioral',
    hasFiles: false,
    hasSetup: false,
    hasPrompt: true,
    prompt: 'Describe how the function works.',
    toolReferences: ['grep_search'],
    location: { line: 10, column: 3 },
    ...overrides,
  };
}

function makeFile(
  cases: EvalCaseRecord[],
  overrides: Partial<EvalFileAnalysis> = {},
): EvalFileAnalysis {
  const firstCase = cases[0];
  return {
    filePath: firstCase?.filePath ?? '/repo/evals/test.eval.ts',
    relativePath: firstCase?.relativePath ?? 'evals/test.eval.ts',
    helpers: { evalTest: 'evalTest' },
    cases,
    toolReferences: [],
    diagnostics: [],
    ...overrides,
  };
}

function makeInventory(
  files: EvalFileAnalysis[],
  overrides: Partial<InventoryResult> = {},
): InventoryResult {
  const allCases = files.flatMap((f) => f.cases);
  const allDiagnostics = files.flatMap((f) => [...f.diagnostics]);
  return {
    totalFiles: files.length,
    totalCases: allCases.length,
    repoRoot: '/repo',
    files,
    cases: allCases,
    diagnostics: allDiagnostics,
    ...overrides,
  };
}

const FIXED_DATE = new Date('2026-07-05T00:00:00.000Z');

describe('eval-validate', () => {
  const registry = buildToolRegistry();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('VALIDATION_RULES', () => {
    it('exports the expected nine rules', () => {
      expect(VALIDATION_RULES).toHaveLength(9);
      const ids = VALIDATION_RULES.map((r) => r.id);
      expect(ids).toEqual([
        'file-naming',
        'valid-policy',
        'suite-metadata',
        'prompt-presence',
        'case-name-static',
        'invalid-tool-refs',
        'positive-assertion',
        'workspace-setup',
        'new-evals-policy',
      ]);
    });

    it('every rule has a non-empty description', () => {
      for (const rule of VALIDATION_RULES) {
        expect(rule.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateInventory', () => {
    it('returns zero violations for a well-formed eval', () => {
      const inventory = makeInventory([makeFile([makeCase()])]);
      const result = validateInventory(inventory, registry);

      expect(result.totalFiles).toBe(1);
      expect(result.totalCases).toBe(1);
      expect(result.totalViolations).toBe(0);
      expect(result.validFiles).toBe(1);
      expect(result.invalidFiles).toBe(0);
      expect(result.violations).toEqual([]);
    });

    it('returns correct file summaries for clean inventory', () => {
      const inventory = makeInventory([
        makeFile([
          makeCase({ name: 'case one' }),
          makeCase({ name: 'case two' }),
        ]),
      ]);
      const result = validateInventory(inventory, registry);

      expect(result.fileSummaries).toEqual([
        {
          relativePath: 'evals/test.eval.ts',
          totalCases: 2,
          violationCount: 0,
        },
      ]);
    });

    it('flags file-naming violation for non-.eval.ts files', () => {
      const c = makeCase({
        filePath: '/repo/evals/bad-name.ts',
        relativePath: 'evals/bad-name.ts',
      });
      const f = makeFile([c], {
        filePath: '/repo/evals/bad-name.ts',
        relativePath: 'evals/bad-name.ts',
      });
      const result = validateInventory(makeInventory([f]), registry);

      const violations = result.violations.filter(
        (v) => v.ruleId === 'file-naming',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('bad-name.ts');
    });

    it('checks relativePath for file-naming when filePath differs', () => {
      const c = makeCase({
        filePath: '/repo/evals/good.eval.ts',
        relativePath: 'evals/bad-name.ts',
      });
      const f = makeFile([c], {
        filePath: '/repo/evals/good.eval.ts',
        relativePath: 'evals/bad-name.ts',
      });
      const result = validateInventory(makeInventory([f]), registry);
      const violations = result.violations.filter(
        (v) => v.ruleId === 'file-naming',
      );
      expect(violations).toHaveLength(1);
    });

    it('accepts .eval.tsx files', () => {
      const c = makeCase({
        filePath: '/repo/evals/component.eval.tsx',
        relativePath: 'evals/component.eval.tsx',
      });
      const f = makeFile([c], {
        filePath: '/repo/evals/component.eval.tsx',
        relativePath: 'evals/component.eval.tsx',
      });
      const result = validateInventory(makeInventory([f]), registry);
      expect(
        result.violations.filter((v) => v.ruleId === 'file-naming'),
      ).toHaveLength(0);
    });

    it('flags valid-policy violation for unknown policy', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ policy: 'unknown' })])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'valid-policy',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('"unknown"');
    });

    it('accepts all three valid policies', () => {
      for (const policy of [
        'ALWAYS_PASSES',
        'USUALLY_PASSES',
        'USUALLY_FAILS',
      ] as const) {
        const result = validateInventory(
          makeInventory([makeFile([makeCase({ policy })])]),
          registry,
        );
        expect(
          result.violations.filter((v) => v.ruleId === 'valid-policy'),
        ).toHaveLength(0);
      }
    });

    it('flags missing suiteName', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ suiteName: undefined })])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'suite-metadata',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('suiteName');
    });

    it('flags missing suiteType', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ suiteType: undefined })])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'suite-metadata',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('suiteType');
    });

    it('flags both missing suiteName and suiteType', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([makeCase({ suiteName: undefined, suiteType: undefined })]),
        ]),
        registry,
      );
      expect(
        result.violations.filter((v) => v.ruleId === 'suite-metadata'),
      ).toHaveLength(2);
    });

    it('flags missing prompt', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ hasPrompt: false })])]),
        registry,
      );
      expect(
        result.violations.filter((v) => v.ruleId === 'prompt-presence'),
      ).toHaveLength(1);
    });

    it('flags case name that could not be statically resolved', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ name: '<unknown>' })])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'case-name-static',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('static string literal');
    });

    it('does not flag a case literally named "unknown"', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ name: 'unknown' })])]),
        registry,
      );
      expect(
        result.violations.filter((v) => v.ruleId === 'case-name-static'),
      ).toHaveLength(0);
    });

    it('collects multiple violations from a single case', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([
            makeCase({
              policy: 'unknown',
              suiteName: undefined,
              suiteType: undefined,
              hasPrompt: false,
              name: '<unknown>',
            }),
          ]),
        ]),
        registry,
      );
      expect(result.totalViolations).toBe(5);
      expect(result.invalidFiles).toBe(1);
      expect(result.validFiles).toBe(0);
    });

    it('filters by relative file paths', () => {
      const f1 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/a.eval.ts',
            relativePath: 'evals/a.eval.ts',
            name: 'case a',
          }),
        ],
        {
          filePath: '/repo/evals/a.eval.ts',
          relativePath: 'evals/a.eval.ts',
        },
      );
      const f2 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/b.eval.ts',
            relativePath: 'evals/b.eval.ts',
            name: 'case b',
            policy: 'unknown',
          }),
        ],
        {
          filePath: '/repo/evals/b.eval.ts',
          relativePath: 'evals/b.eval.ts',
        },
      );
      const result = validateInventory(makeInventory([f1, f2]), registry, {
        filePaths: ['evals/a.eval.ts'],
      });
      expect(result.totalFiles).toBe(1);
      expect(result.totalViolations).toBe(0);
    });

    it('filters by absolute file paths', () => {
      const f1 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/a.eval.ts',
            relativePath: 'evals/a.eval.ts',
            name: 'case a',
          }),
        ],
        {
          filePath: '/repo/evals/a.eval.ts',
          relativePath: 'evals/a.eval.ts',
        },
      );
      const f2 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/b.eval.ts',
            relativePath: 'evals/b.eval.ts',
            name: 'case b',
            policy: 'unknown',
          }),
        ],
        {
          filePath: '/repo/evals/b.eval.ts',
          relativePath: 'evals/b.eval.ts',
        },
      );
      const result = validateInventory(makeInventory([f1, f2]), registry, {
        filePaths: ['/repo/evals/b.eval.ts'],
      });
      expect(result.totalFiles).toBe(1);
      expect(result.totalViolations).toBeGreaterThanOrEqual(1);
    });

    it('filters by relative file paths with dot-slash prefix (./)', () => {
      const f1 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/a.eval.ts',
            relativePath: 'evals/a.eval.ts',
            name: 'case a',
          }),
        ],
        {
          filePath: '/repo/evals/a.eval.ts',
          relativePath: 'evals/a.eval.ts',
        },
      );
      const result = validateInventory(makeInventory([f1]), registry, {
        filePaths: ['./evals/a.eval.ts'],
      });
      expect(result.totalFiles).toBe(1);
      expect(result.unmatchedFilePaths).toEqual([]);
    });

    it('tracks and returns unmatched file paths', () => {
      const f1 = makeFile(
        [
          makeCase({
            filePath: '/repo/evals/a.eval.ts',
            relativePath: 'evals/a.eval.ts',
            name: 'case a',
          }),
        ],
        {
          filePath: '/repo/evals/a.eval.ts',
          relativePath: 'evals/a.eval.ts',
        },
      );
      const result = validateInventory(makeInventory([f1]), registry, {
        filePaths: ['./evals/a.eval.ts', 'evals/missing.eval.ts'],
      });
      expect(result.totalFiles).toBe(1);
      expect(result.unmatchedFilePaths).toEqual(['evals/missing.eval.ts']);
    });

    it('forwards analyzer diagnostics in the result', () => {
      const diag: EvalAnalysisDiagnostic = {
        severity: 'warning',
        message: 'Could not resolve wrapper helper',
        filePath: '/repo/evals/test.eval.ts',
        location: { line: 5, column: 1 },
      };
      const f = makeFile([makeCase()], { diagnostics: [diag] });
      const result = validateInventory(makeInventory([f]), registry);
      expect(result.analyzerDiagnostics).toHaveLength(1);
      expect(result.analyzerDiagnostics[0].message).toBe(
        'Could not resolve wrapper helper',
      );
    });

    it('flags invalid-tool-refs when unrecognized tools are reported in diagnostics', () => {
      const diag: EvalAnalysisDiagnostic = {
        severity: 'warning',
        message: 'Unrecognized tool name extracted: "bad_tool"',
        filePath: '/repo/evals/test.eval.ts',
        location: { line: 5, column: 1 },
      };
      const f = makeFile([makeCase()], { diagnostics: [diag] });
      const result = validateInventory(makeInventory([f]), registry);
      const violations = result.violations.filter(
        (v) => v.ruleId === 'invalid-tool-refs',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('bad_tool');
    });

    it('flags positive-assertion when standard test has no tool references', () => {
      const c = makeCase({ toolReferences: [] });
      const result = validateInventory(
        makeInventory([makeFile([c])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'positive-assertion',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain(
        'assert function does not track any tool references',
      );
    });

    it('does not flag positive-assertion for component-level tests', () => {
      const c1 = makeCase({
        baseHelperName: 'componentEvalTest',
        toolReferences: [],
      });
      const c2 = makeCase({
        suiteType: 'component-level',
        toolReferences: [],
      });
      const result = validateInventory(
        makeInventory([makeFile([c1, c2])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'positive-assertion',
      );
      expect(violations).toHaveLength(0);
    });

    it('flags workspace-setup when workspace prompt has no files or setup config', () => {
      const c = makeCase({
        prompt: 'Please edit app.ts and fix the typo.',
        hasFiles: false,
        hasSetup: false,
      });
      const result = validateInventory(
        makeInventory([makeFile([c])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'workspace-setup',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('suggests workspace interaction');
    });

    it('accepts workspace prompt if files or setup are provided', () => {
      const c1 = makeCase({
        prompt: 'Please edit app.ts and fix the typo.',
        hasFiles: true,
        hasSetup: false,
      });
      const c2 = makeCase({
        prompt: 'Please edit app.ts and fix the typo.',
        hasFiles: false,
        hasSetup: true,
      });
      const result = validateInventory(
        makeInventory([makeFile([c1, c2])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'workspace-setup',
      );
      expect(violations).toHaveLength(0);
    });

    it('flags new-evals-policy when a new file has ALWAYS_PASSES policy', () => {
      const c = makeCase({
        filePath: '/repo/evals/untracked-test.eval.ts',
        relativePath: 'evals/untracked-test.eval.ts',
        policy: 'ALWAYS_PASSES',
      });

      // First call: git status --porcelain (working-tree additions)
      vi.mocked(execSync).mockReturnValueOnce(
        '?? evals/untracked-test.eval.ts\n',
      );
      // Subsequent calls for git merge-base can throw — addFromOutput won't add anything
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('no merge base');
      });

      const result = validateInventory(
        makeInventory([makeFile([c])]),
        registry,
      );
      const violations = result.violations.filter(
        (v) => v.ruleId === 'new-evals-policy',
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain(
        'not use ALWAYS_PASSES policy initially',
      );
    });

    it('validates the real evals directory without crashing', async () => {
      const { collectInventory } = await import('../utils/eval-inventory.js');
      const repoRoot = path.resolve(import.meta.dirname, '../../');
      const inventory = await collectInventory(repoRoot);
      const result = validateInventory(inventory, registry);
      expect(result.totalFiles).toBeGreaterThanOrEqual(1);
      expect(result.totalCases).toBeGreaterThanOrEqual(1);
      expect(typeof result.totalViolations).toBe('number');
    });
  });

  describe('formatValidationReport', () => {
    it('shows success message when there are no violations', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase()])]),
        registry,
      );
      const report = formatValidationReport(result, '/repo');

      expect(report).toContain('Eval Validation Report');
      expect(report).toContain('1 files');
      expect(report).toContain('0 violations');
      expect(report).toContain('✓ All eval cases pass validation.');
    });

    it('shows violations grouped by file with rule IDs', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([makeCase({ policy: 'unknown', suiteName: undefined })]),
        ]),
        registry,
      );
      const report = formatValidationReport(result, '/repo');
      expect(report).toContain('[valid-policy]');
      expect(report).toContain('[suite-metadata]');
      expect(report).toContain('Summary');
      expect(report).toContain('violation(s) found');
    });

    it('converts absolute paths to relative in report', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([
            makeCase({
              filePath: '/repo/evals/test.eval.ts',
              policy: 'unknown',
            }),
          ]),
        ]),
        registry,
      );
      const report = formatValidationReport(result, '/repo');
      expect(report).toContain('evals/test.eval.ts');
      expect(report).not.toContain('/repo/evals/test.eval.ts');
    });

    it('includes analyzer diagnostics section when present', () => {
      const diag: EvalAnalysisDiagnostic = {
        severity: 'warning',
        message: 'Could not resolve wrapper',
        filePath: '/repo/evals/test.eval.ts',
        location: { line: 5, column: 1 },
      };
      const f = makeFile([makeCase({ policy: 'unknown' })], {
        diagnostics: [diag],
      });
      const result = validateInventory(makeInventory([f]), registry);
      const report = formatValidationReport(result, '/repo');
      expect(report).toContain('Analyzer Diagnostics (1)');
      expect(report).toContain('Could not resolve wrapper');
    });
  });

  describe('formatValidationJson', () => {
    it('returns valid JSON with the expected schema', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase()])]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo', FIXED_DATE),
      );

      expect(parsed.version).toBe(1);
      expect(parsed.generated).toBe('2026-07-05T00:00:00.000Z');
      expect(parsed.summary.totalFiles).toBe(1);
      expect(parsed.summary.totalCases).toBe(1);
      expect(parsed.summary.totalViolations).toBe(0);
      expect(parsed.summary.validFiles).toBe(1);
      expect(parsed.summary.invalidFiles).toBe(0);
      expect(parsed.violations).toEqual([]);
    });

    it('includes violations in the JSON output', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([makeCase({ policy: 'unknown', suiteName: undefined })]),
        ]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo', FIXED_DATE),
      );

      expect(parsed.summary.totalViolations).toBeGreaterThanOrEqual(2);
      expect(parsed.violations.length).toBe(parsed.summary.totalViolations);
      for (const v of parsed.violations) {
        expect(v).toHaveProperty('ruleId');
        expect(v).toHaveProperty('message');
        expect(v).toHaveProperty('filePath');
        expect(v).toHaveProperty('location');
        expect(typeof v.location.line).toBe('number');
        expect(typeof v.location.column).toBe('number');
      }
    });

    it('uses relative paths in JSON violations', () => {
      const result = validateInventory(
        makeInventory([
          makeFile([
            makeCase({
              filePath: '/repo/evals/test.eval.ts',
              policy: 'unknown',
            }),
          ]),
        ]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo', FIXED_DATE),
      );
      for (const v of parsed.violations) {
        expect(v.filePath).not.toMatch(/^\//);
        expect(v.filePath).toContain('evals/test.eval.ts');
      }
    });

    it('respects SOURCE_DATE_EPOCH for reproducible output', () => {
      vi.stubEnv('SOURCE_DATE_EPOCH', '1000000000');
      const result = validateInventory(
        makeInventory([makeFile([makeCase()])]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo'),
      );
      expect(parsed.generated).toBe('2001-09-09T01:46:40.000Z');
    });

    it('respects EVAL_VALIDATE_STABLE_DATE for deterministic output', () => {
      vi.stubEnv('EVAL_VALIDATE_STABLE_DATE', '1');
      const result = validateInventory(
        makeInventory([makeFile([makeCase()])]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo'),
      );
      expect(parsed.generated).toBe('1970-01-01T00:00:00.000Z');
    });

    it('JSON output schema is stable', () => {
      const result = validateInventory(
        makeInventory([makeFile([makeCase({ policy: 'unknown' })])]),
        registry,
      );
      const parsed: ValidationJsonOutput = JSON.parse(
        formatValidationJson(result, '/repo', FIXED_DATE),
      );
      expect(Object.keys(parsed).sort()).toEqual([
        'generated',
        'summary',
        'version',
        'violations',
      ]);
      expect(Object.keys(parsed.summary).sort()).toEqual([
        'invalidFiles',
        'totalCases',
        'totalFiles',
        'totalViolations',
        'validFiles',
      ]);
    });
  });
});
