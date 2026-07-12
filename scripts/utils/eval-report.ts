/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { InventoryResult } from './eval-inventory.js';

export interface ReportCaseSummary {
  name: string;
  passed: number;
  total: number;
  passRate: number;
  policy: string;
  filePath: string;
}

export interface ModelSummary {
  modelName: string;
  totalCases: number;
  passedCount: number;
  totalRuns: number;
  passedRuns: number;
  overallPassRate: number;
  cases: ReportCaseSummary[];
}

export interface ReportSummaryResult {
  totalFiles: number;
  models: ModelSummary[];
}

/**
 * Recursively scans a directory for report.json files.
 */
export function findReportFiles(dir: string): string[] {
  const reports: string[] = [];
  if (!fs.existsSync(dir)) return reports;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      reports.push(...findReportFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'report.json') {
      reports.push(fullPath);
    }
  }
  return reports;
}

/**
 * Parses the model name from the directory path or defaults to env.
 */
export function getModelFromPath(reportPath: string): string {
  const normalized = path.normalize(reportPath).replace(/\\/g, '/');
  const parts = normalized.split('/');
  const logDir = parts.find((p) => p.startsWith('eval-logs-'));
  if (logDir) {
    const match = logDir.match(/^eval-logs-(.+)-(\d+)$/);
    if (match) return match[1];
    const matchSimple = logDir.match(/^eval-logs-(.+)$/);
    if (matchSimple) return matchSimple[1];
  }
  return process.env.GEMINI_MODEL || 'unknown-model';
}

/**
 * Summarizes the pass rate stats by test case and model from report.json files.
 */
export async function summarizeReports(
  reportsDir: string,
  inventory?: InventoryResult,
): Promise<ReportSummaryResult> {
  const reportPaths = findReportFiles(reportsDir);
  const modelSummariesMap = new Map<
    string,
    Map<
      string,
      { name: string; passed: number; total: number; filePath: string }
    >
  >();

  for (const reportPath of reportPaths) {
    try {
      const model = getModelFromPath(reportPath);
      if (!modelSummariesMap.has(model)) {
        modelSummariesMap.set(model, new Map());
      }
      const testCasesMap = modelSummariesMap.get(model)!;

      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (data && Array.isArray(data.testResults)) {
        for (const fileResult of data.testResults) {
          const filePath = fileResult.name;
          const normalizedPath = path.resolve(filePath).replace(/\\/g, '/');
          if (Array.isArray(fileResult.assertionResults)) {
            for (const assertion of fileResult.assertionResults) {
              const testName = assertion.title;
              const compoundKey = `${normalizedPath}::${testName}`;
              if (!testCasesMap.has(compoundKey)) {
                testCasesMap.set(compoundKey, {
                  name: testName,
                  passed: 0,
                  total: 0,
                  filePath,
                });
              }
              const stats = testCasesMap.get(compoundKey)!;
              stats.total += 1;
              if (assertion.status === 'passed') {
                stats.passed += 1;
              }
            }
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error reading or parsing report at ${reportPath}: ${msg}`);
    }
  }

  const policyMap = new Map<string, string>();
  if (inventory) {
    for (const caseRec of inventory.cases) {
      const normalizedCasePath = path
        .resolve(caseRec.filePath)
        .replace(/\\/g, '/');
      const key = `${normalizedCasePath}::${caseRec.name}`;
      policyMap.set(key, caseRec.policy);
    }
  }

  const models: ModelSummary[] = [];
  for (const [modelName, testCasesMap] of modelSummariesMap.entries()) {
    const cases: ReportCaseSummary[] = [];
    let totalRuns = 0;
    let passedRuns = 0;

    for (const stats of testCasesMap.values()) {
      const normalizedPath = path.resolve(stats.filePath).replace(/\\/g, '/');
      const key = `${normalizedPath}::${stats.name}`;
      const policy = policyMap.get(key) || 'unknown';
      const passRate = stats.total > 0 ? stats.passed / stats.total : 0;
      cases.push({
        name: stats.name,
        passed: stats.passed,
        total: stats.total,
        passRate,
        policy,
        filePath: stats.filePath,
      });
      totalRuns += stats.total;
      passedRuns += stats.passed;
    }

    cases.sort((a, b) => a.name.localeCompare(b.name, 'en'));

    models.push({
      modelName,
      totalCases: testCasesMap.size,
      passedCount: cases.filter((c) => c.passRate === 1.0).length,
      totalRuns,
      passedRuns,
      overallPassRate: totalRuns > 0 ? passedRuns / totalRuns : 0,
      cases,
    });
  }

  models.sort((a, b) => a.modelName.localeCompare(b.modelName, 'en'));

  return {
    totalFiles: reportPaths.length,
    models,
  };
}

/**
 * Formats report summary to human-readable string.
 */
export function formatReportSummary(
  result: ReportSummaryResult,
  repoRoot?: string,
): string {
  const lines: string[] = [];
  lines.push('Eval Nightly Pass Rate Report');
  lines.push('═════════════════════════════');
  lines.push('');
  lines.push(`Processed ${result.totalFiles} report(s).`);
  lines.push('');

  if (result.models.length === 0) {
    lines.push('No report data found.');
    return lines.join('\n');
  }

  for (const model of result.models) {
    lines.push(`Model: ${model.modelName}`);
    lines.push('───────────────────────');
    lines.push(`  Unique cases: ${model.totalCases}`);
    lines.push(
      `  Total runs:   ${model.totalRuns} (Passed: ${model.passedRuns}, Failed: ${
        model.totalRuns - model.passedRuns
      })`,
    );
    lines.push(`  Pass rate:    ${(model.overallPassRate * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('  Test Cases:');
    for (const c of model.cases) {
      const relPath =
        repoRoot && path.isAbsolute(c.filePath)
          ? path.relative(repoRoot, c.filePath).replace(/\\/g, '/')
          : c.filePath;
      const indicator =
        c.passRate === 1.0 ? '✓' : c.passRate === 0 ? '✗' : '⚠';
      lines.push(
        `    ${indicator} [${c.policy}] ${c.name} — ${(
          c.passRate * 100
        ).toFixed(1)}% (${c.passed}/${c.total}) [${relPath}]`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats report summary to deterministic JSON.
 */
export function formatReportSummaryJson(
  result: ReportSummaryResult,
  repoRoot?: string,
  now?: Date,
): string {
  let generatedDate = now || new Date();
  if (process.env.EVAL_INVENTORY_DETERMINISTIC) {
    generatedDate = new Date(0);
  }
  const output = {
    version: 1,
    generated: generatedDate.toISOString(),
    totalFiles: result.totalFiles,
    models: result.models.map((m) => ({
      modelName: m.modelName,
      totalCases: m.totalCases,
      passedCount: m.passedCount,
      totalRuns: m.totalRuns,
      passedRuns: m.passedRuns,
      overallPassRate: m.overallPassRate,
      cases: m.cases.map((c) => ({
        name: c.name,
        passed: c.passed,
        total: c.total,
        passRate: c.passRate,
        policy: c.policy,
        filePath:
          repoRoot && path.isAbsolute(c.filePath)
            ? path.relative(repoRoot, c.filePath).replace(/\\/g, '/')
            : c.filePath,
      })),
    })),
  };
  return JSON.stringify(output, null, 2);
}
