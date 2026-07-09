/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type {
  EvalCaseRecord,
  EvalAnalysisDiagnostic,
} from './eval-analysis.js';
import type { InventoryResult } from './eval-inventory.js';
import type { ToolRegistry } from './tool-registry.js';

export interface ValidationRule {
  id: string;
  description: string;
}

export interface ValidationViolation {
  ruleId: string;
  message: string;
  filePath: string;
  location: { line: number; column: number };
}

export interface FileValidationSummary {
  relativePath: string;
  totalCases: number;
  violationCount: number;
}

export interface ValidationResult {
  totalFiles: number;
  totalCases: number;
  totalViolations: number;
  invalidFiles: number;
  validFiles: number;
  violations: ValidationViolation[];
  fileSummaries: FileValidationSummary[];
  analyzerDiagnostics: readonly EvalAnalysisDiagnostic[];
  unmatchedFilePaths?: string[];
}

export const VALIDATION_RULES: readonly ValidationRule[] = [
  {
    id: 'file-naming',
    description:
      'Eval file relativePath must match the *.eval.ts or *.eval.tsx naming convention.',
  },
  {
    id: 'valid-policy',
    description:
      'Policy must be one of ALWAYS_PASSES, USUALLY_PASSES, or USUALLY_FAILS.',
  },
  {
    id: 'suite-metadata',
    description:
      'Both suiteName and suiteType must be present as static string literals.',
  },
  {
    id: 'prompt-presence',
    description: 'The prompt property must be present in the eval case object.',
  },
  {
    id: 'case-name-static',
    description:
      'The case name must be a static string literal, not a computed value.',
  },
];

const VALID_FILE_SUFFIXES = ['.eval.ts', '.eval.tsx'] as const;
const VALID_POLICIES = new Set([
  'ALWAYS_PASSES',
  'USUALLY_PASSES',
  'USUALLY_FAILS',
]);

function checkFileNaming(
  evalCase: EvalCaseRecord,
  filePath: string,
): ValidationViolation | undefined {
  // Check the relativePath because collectInventory's glob already filters by
  // *.eval.{ts,tsx}. This rule catches cases from manually constructed
  // inventories or future non-glob discovery paths.
  const checkPath = evalCase.relativePath || filePath;
  const base = path.basename(checkPath);
  if (!VALID_FILE_SUFFIXES.some((suffix) => base.endsWith(suffix))) {
    return {
      ruleId: 'file-naming',
      message: `File "${base}" does not match the required *.eval.ts or *.eval.tsx naming convention.`,
      filePath,
      location: evalCase.location,
    };
  }
  return undefined;
}

function checkValidPolicy(
  evalCase: EvalCaseRecord,
  filePath: string,
): ValidationViolation | undefined {
  if (!VALID_POLICIES.has(evalCase.policy)) {
    return {
      ruleId: 'valid-policy',
      message: `Policy "${evalCase.policy}" is not valid. Must be one of: ${[...VALID_POLICIES].join(', ')}.`,
      filePath,
      location: evalCase.location,
    };
  }
  return undefined;
}

function checkSuiteMetadata(
  evalCase: EvalCaseRecord,
  filePath: string,
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  if (!evalCase.suiteName) {
    violations.push({
      ruleId: 'suite-metadata',
      message:
        'Missing suiteName. Add a static suiteName string to the eval case object.',
      filePath,
      location: evalCase.location,
    });
  }
  if (!evalCase.suiteType) {
    violations.push({
      ruleId: 'suite-metadata',
      message:
        'Missing suiteType. Add a static suiteType string to the eval case object.',
      filePath,
      location: evalCase.location,
    });
  }
  return violations;
}

function checkPromptPresence(
  evalCase: EvalCaseRecord,
  filePath: string,
): ValidationViolation | undefined {
  if (
    evalCase.baseHelperName === 'componentEvalTest' ||
    evalCase.suiteType === 'component-level'
  ) {
    return undefined;
  }
  if (!evalCase.hasPrompt) {
    return {
      ruleId: 'prompt-presence',
      message:
        'Eval case is missing a prompt property. Every case must include a prompt.',
      filePath,
      location: evalCase.location,
    };
  }
  return undefined;
}

function checkCaseNameStatic(
  evalCase: EvalCaseRecord,
  filePath: string,
): ValidationViolation | undefined {
  // The analyzer stores unresolved names as '<unknown>' (eval-analysis.ts L159).
  if (evalCase.name === '<unknown>') {
    return {
      ruleId: 'case-name-static',
      message:
        'Case name could not be resolved to a static string literal. Use a plain string, not a variable or template expression.',
      filePath,
      location: evalCase.location,
    };
  }
  return undefined;
}

/**
 * Validates every eval case in the given inventory and returns a
 * ValidationResult. Pass `options.filePaths` to restrict to a subset of
 * files (absolute or relative to `inventory.repoRoot`).
 *
 * The `_registry` parameter is reserved for future tool-name validation rules.
 */
export function validateInventory(
  inventory: InventoryResult,
  _registry: ToolRegistry,
  options: { filePaths?: string[] } = {},
): ValidationResult {
  const { filePaths: filterPaths } = options;

  const matchedFilterSet = new Set<string>();
  const filterMap = new Map<string, string>(); // maps normalized relative path -> original filter path

  const filterSet: Set<string> | undefined = filterPaths
    ? new Set(
        filterPaths.map((p) => {
          let abs: string;
          if (path.isAbsolute(p)) {
            abs = p;
          } else {
            abs = path.resolve(inventory.repoRoot || process.cwd(), p);
          }
          const rel = inventory.repoRoot
            ? path.relative(inventory.repoRoot, abs)
            : abs;
          const normalized = rel.replace(/\\/g, '/');
          filterMap.set(normalized, p);
          return normalized;
        }),
      )
    : undefined;

  const fileSummaryMap = new Map<
    string,
    { totalCases: number; violationCount: number }
  >();
  const allViolations: ValidationViolation[] = [];

  for (const fileAnalysis of inventory.files) {
    const relativePath = fileAnalysis.relativePath;
    if (filterSet) {
      if (!filterSet.has(relativePath)) {
        continue;
      }
      matchedFilterSet.add(relativePath);
    }

    if (!fileSummaryMap.has(relativePath)) {
      fileSummaryMap.set(relativePath, { totalCases: 0, violationCount: 0 });
    }

    for (const evalCase of fileAnalysis.cases) {
      const summary = fileSummaryMap.get(relativePath)!;
      summary.totalCases += 1;
      const fp = evalCase.filePath;
      const caseViolations: ValidationViolation[] = [];

      const fn = checkFileNaming(evalCase, fp);
      if (fn) caseViolations.push(fn);

      const pol = checkValidPolicy(evalCase, fp);
      if (pol) caseViolations.push(pol);

      caseViolations.push(...checkSuiteMetadata(evalCase, fp));

      const pr = checkPromptPresence(evalCase, fp);
      if (pr) caseViolations.push(pr);

      const ns = checkCaseNameStatic(evalCase, fp);
      if (ns) caseViolations.push(ns);

      allViolations.push(...caseViolations);
      summary.violationCount += caseViolations.length;
    }
  }

  const fileSummaries: FileValidationSummary[] = [...fileSummaryMap.entries()]
    .map(([relativePath, s]) => ({
      relativePath,
      totalCases: s.totalCases,
      violationCount: s.violationCount,
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));

  const totalFiles = fileSummaries.length;
  const totalCases = fileSummaries.reduce((sum, f) => sum + f.totalCases, 0);
  const totalViolations = allViolations.length;
  const invalidFiles = fileSummaries.filter((f) => f.violationCount > 0).length;

  const unmatchedFilePaths: string[] = [];
  if (filterSet) {
    for (const f of filterSet) {
      if (!matchedFilterSet.has(f)) {
        const original = filterMap.get(f);
        if (original !== undefined) {
          unmatchedFilePaths.push(original);
        }
      }
    }
  }

  return {
    totalFiles,
    totalCases,
    totalViolations,
    invalidFiles,
    validFiles: totalFiles - invalidFiles,
    violations: allViolations,
    fileSummaries,
    analyzerDiagnostics: inventory.diagnostics,
    unmatchedFilePaths,
  };
}

function resolveDisplayPath(filePath: string, repoRoot?: string): string {
  if (filePath === '<inline>') return filePath;
  if (repoRoot && path.isAbsolute(filePath)) {
    return path.relative(repoRoot, filePath).replace(/\\/g, '/');
  }
  return filePath;
}

function appendAnalyzerDiagnostics(
  lines: string[],
  diagnostics: readonly EvalAnalysisDiagnostic[],
  repoRoot?: string,
): void {
  lines.push(`Analyzer Diagnostics (${diagnostics.length})`);
  lines.push('────────────────────────');
  for (const d of diagnostics) {
    const displayPath = resolveDisplayPath(d.filePath, repoRoot);
    lines.push(
      `⚠ ${displayPath}:${d.location.line}:${d.location.column} — ${d.message}`,
    );
  }
  lines.push('');
}

export function formatValidationReport(
  result: ValidationResult,
  repoRoot?: string,
): string {
  const lines: string[] = [];

  lines.push('Eval Validation Report');
  lines.push('══════════════════════');
  lines.push('');
  lines.push(
    `${result.totalFiles} files · ${result.totalCases} cases · ${result.totalViolations} violations`,
  );

  if (result.totalViolations === 0) {
    lines.push('');
    lines.push('✓ All eval cases pass validation.');
    if (result.analyzerDiagnostics.length > 0) {
      lines.push('');
      appendAnalyzerDiagnostics(lines, result.analyzerDiagnostics, repoRoot);
    }
    return lines.join('\n');
  }

  lines.push('');

  const byFile = new Map<string, ValidationViolation[]>();
  for (const v of result.violations) {
    const displayPath = resolveDisplayPath(v.filePath, repoRoot);
    const existing = byFile.get(displayPath);
    if (existing) {
      existing.push(v);
    } else {
      byFile.set(displayPath, [v]);
    }
  }

  for (const [displayPath, violations] of [...byFile.entries()].sort(
    ([a], [b]) => a.localeCompare(b, 'en'),
  )) {
    lines.push(displayPath);
    for (const v of violations) {
      lines.push(
        `  ✗ [${v.ruleId}] ${v.location.line}:${v.location.column} — ${v.message}`,
      );
    }
    lines.push('');
  }

  lines.push('Summary');
  lines.push('───────');
  lines.push(`  ${result.validFiles} / ${result.totalFiles} files pass`);
  lines.push(`  ${result.totalViolations} violation(s) found`);
  lines.push('');

  if (result.analyzerDiagnostics.length > 0) {
    appendAnalyzerDiagnostics(lines, result.analyzerDiagnostics, repoRoot);
  }

  return lines.join('\n');
}

export interface ValidationJsonViolation {
  ruleId: string;
  message: string;
  filePath: string;
  location: { line: number; column: number };
}

export interface ValidationJsonOutput {
  version: 1;
  generated: string;
  summary: {
    totalFiles: number;
    totalCases: number;
    totalViolations: number;
    validFiles: number;
    invalidFiles: number;
  };
  violations: ValidationJsonViolation[];
}

export function formatValidationJson(
  result: ValidationResult,
  repoRoot?: string,
  now?: Date,
): string {
  let generatedDate = now;
  if (!generatedDate && process.env.SOURCE_DATE_EPOCH) {
    const epoch = parseInt(process.env.SOURCE_DATE_EPOCH, 10);
    if (!isNaN(epoch)) generatedDate = new Date(epoch * 1000);
  }
  if (
    !generatedDate &&
    (process.env.EVAL_VALIDATE_STABLE_DATE ||
      process.env.EVAL_INVENTORY_DETERMINISTIC)
  ) {
    generatedDate = new Date(0);
  }
  if (!generatedDate) generatedDate = new Date();

  const output: ValidationJsonOutput = {
    version: 1,
    generated: generatedDate.toISOString(),
    summary: {
      totalFiles: result.totalFiles,
      totalCases: result.totalCases,
      totalViolations: result.totalViolations,
      validFiles: result.validFiles,
      invalidFiles: result.invalidFiles,
    },
    violations: result.violations.map((v) => ({
      ruleId: v.ruleId,
      message: v.message,
      filePath: resolveDisplayPath(v.filePath, repoRoot),
      location: { line: v.location.line, column: v.location.column },
    })),
  };

  return JSON.stringify(output, null, 2);
}
