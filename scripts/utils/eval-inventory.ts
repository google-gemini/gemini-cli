/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

import {
  analyzeEvalSource,
  type EvalCaseRecord,
  type EvalFileAnalysis,
  type EvalAnalysisDiagnostic,
  type EvalPolicy,
} from './eval-analysis.js';

export interface InventoryResult {
  totalFiles: number;
  totalCases: number;
  files: EvalFileAnalysis[];
  cases: readonly EvalCaseRecord[];
  diagnostics: readonly EvalAnalysisDiagnostic[];
}

/**
 * Discovers all eval files under the given repo root and runs
 * the static analyzer on each, returning the aggregated results.
 */
export async function collectInventory(
  repoRoot: string,
): Promise<InventoryResult> {
  const evalsDir = path.join(repoRoot, 'evals');
  const pattern = '**/*.eval.{ts,tsx}';

  const evalFiles = await glob(pattern, {
    cwd: evalsDir,
    absolute: true,
    nodir: true,
  });

  evalFiles.sort();

  const files: EvalFileAnalysis[] = [];
  const allCases: EvalCaseRecord[] = [];
  const allDiagnostics: EvalAnalysisDiagnostic[] = [];

  for (const filePath of evalFiles) {
    const sourceText = await fs.promises.readFile(filePath, 'utf-8');
    const analysis = analyzeEvalSource(sourceText, { filePath, repoRoot });
    files.push(analysis);
    allCases.push(...analysis.cases);
    allDiagnostics.push(...analysis.diagnostics);
  }

  return {
    totalFiles: files.length,
    totalCases: allCases.length,
    files,
    cases: allCases,
    diagnostics: allDiagnostics,
  };
}

/**
 * Formats an InventoryResult into a human-readable report string.
 */
export function formatInventoryReport(result: InventoryResult): string {
  const lines: string[] = [];

  lines.push('Eval Inventory');
  lines.push('══════════════');
  lines.push('');
  lines.push(
    `${result.totalFiles} files · ${result.totalCases} cases · ${result.diagnostics.length} diagnostics`,
  );
  lines.push('');

  // --- By Policy ---
  lines.push('By Policy');
  lines.push('─────────');

  const byPolicy = groupBy(result.cases, (c) => c.policy);
  const policyOrder: EvalPolicy[] = [
    'ALWAYS_PASSES',
    'USUALLY_PASSES',
    'USUALLY_FAILS',
    'unknown',
  ];

  for (const policy of policyOrder) {
    const cases = byPolicy.get(policy);
    if (!cases || cases.length === 0) {
      continue;
    }

    lines.push(`${policy} (${cases.length} cases)`);

    const byFile = groupBy(cases, (c) => c.relativePath);
    for (const [filePath, fileCases] of byFile) {
      lines.push(`  ${filePath}`);
      for (const evalCase of fileCases) {
        lines.push(`    • ${evalCase.name} [${evalCase.helperName}]`);
      }
    }
    lines.push('');
  }

  // --- By Suite ---
  lines.push('By Suite');
  lines.push('────────');

  const bySuite = groupBy(result.cases, (c) => c.suiteName ?? '(no suite)');
  const suiteNames = [...bySuite.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (a === '(no suite)') return 1;
    if (b === '(no suite)') return -1;
    return a.localeCompare(b, 'en');
  });

  for (const suite of suiteNames) {
    const cases = bySuite.get(suite)!;
    lines.push(`${suite} (${cases.length} cases)`);

    for (const evalCase of cases) {
      lines.push(
        `  • ${evalCase.name} [${evalCase.relativePath}] (${evalCase.policy})`,
      );
    }
    lines.push('');
  }

  // --- Diagnostics ---
  if (result.diagnostics.length > 0) {
    const filePaths = new Map<string, string>();
    for (const f of result.files) {
      filePaths.set(f.filePath, f.relativePath);
    }

    lines.push('Diagnostics');
    lines.push('───────────');
    for (const diagnostic of result.diagnostics) {
      const displayPath =
        diagnostic.filePath === '<inline>'
          ? diagnostic.filePath
          : (filePaths.get(diagnostic.filePath) ?? diagnostic.filePath);
      lines.push(
        `⚠ ${displayPath}:${diagnostic.location.line}:${diagnostic.location.column} — ${diagnostic.message}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function groupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}
