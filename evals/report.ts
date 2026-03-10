/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScorerResult, AgentTrace } from './scorers/scorer.js';

/**
 * One test-case result — the trace plus every scorer's verdict.
 */
export interface EvalResult {
  /** Human-readable name of the eval case, e.g. `'rag_context_retrieval#1'`. */
  testName: string;
  trace: AgentTrace;
  scores: ScorerResult[];
  /** true if ALL scorers passed. */
  pass: boolean;
}

/**
 * Aggregate statistics across all eval runs for a single scorer.
 */
export interface ScorerStats {
  scorer: string;
  total: number;
  passed: number;
  passRate: number;
  meanScore: number;
  p50Score: number;
  p90Score: number;
}

/**
 * Full eval run report.
 */
export interface EvalReport {
  runId: string;
  timestamp: string;
  totalTests: number;
  passedTests: number;
  overallPassRate: number;
  scorerStats: ScorerStats[];
  results: EvalResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    let bucket = map.get(k);
    if (!bucket) {
      bucket = [];
      map.set(k, bucket);
    }
    bucket.push(item);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

/**
 * Builds an {@link EvalReport} from a flat list of {@link EvalResult}s.
 */
export function buildReport(results: EvalResult[]): EvalReport {
  const runId = `run-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const passed = results.filter((r) => r.pass).length;

  // Collect all ScorerResults across all test cases
  const allScores: ScorerResult[] = results.flatMap((r) => r.scores);
  const byScorer = groupBy(allScores, (s) => s.scorer);

  const scorerStats: ScorerStats[] = [];
  for (const [scorer, scores] of byScorer) {
    const numeric = scores.map((s) => s.score).sort((a, b) => a - b);
    scorerStats.push({
      scorer,
      total: scores.length,
      passed: scores.filter((s) => s.pass).length,
      passRate: scores.filter((s) => s.pass).length / scores.length,
      meanScore: numeric.reduce((a, b) => a + b, 0) / numeric.length,
      p50Score: percentile(numeric, 50),
      p90Score: percentile(numeric, 90),
    });
  }

  return {
    runId,
    timestamp,
    totalTests: results.length,
    passedTests: passed,
    overallPassRate: results.length > 0 ? passed / results.length : 0,
    scorerStats,
    results,
  };
}

/**
 * Writes an {@link EvalReport} as pretty-printed JSON to
 * `evals/reports/<runId>.json`, creating the directory if needed.
 */
export async function writeReport(
  report: EvalReport,
  reportsDir: string,
): Promise<string> {
  await fs.mkdir(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `${report.runId}.json`);
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  return outPath;
}
