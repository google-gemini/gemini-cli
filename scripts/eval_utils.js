/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Finds all report.json files recursively in a directory.
 */
export function findReports(dir) {
  const reports = [];
  if (!fs.existsSync(dir)) return reports;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      reports.push(...findReports(fullPath));
    } else if (file === 'report.json') {
      reports.push(fullPath);
    }
  }
  return reports;
}

/**
 * Extracts the model name from the artifact path.
 */
export function getModelFromPath(reportPath) {
  const parts = reportPath.split(path.sep);
  // Look for the directory that follows the 'eval-logs-' pattern
  const artifactDir = parts.find((p) => p.startsWith('eval-logs-'));
  if (!artifactDir) return 'unknown';

  const match = artifactDir.match(/^eval-logs-(.+)-(\d+)$/);
  return match ? match[1] : 'unknown';
}

/**
 * Escapes special characters in a string for use in a regular expression.
 */
export function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aggregates stats from a list of report.json files.
 * @returns {Record<string, Record<string, {passed: number, total: number, file?: string}>>} statsByModel
 */
export function getStatsFromReports(reports) {
  const statsByModel = {};

  for (const reportPath of reports) {
    try {
      const model = getModelFromPath(reportPath);
      if (!statsByModel[model]) {
        statsByModel[model] = {};
      }
      const testStats = statsByModel[model];

      const content = fs.readFileSync(reportPath, 'utf-8');
      const json = JSON.parse(content);

      for (const testResult of json.testResults) {
        const filePath = testResult.name;
        for (const assertion of testResult.assertionResults) {
          const name = assertion.title;
          if (!testStats[name]) {
            testStats[name] = { passed: 0, total: 0, file: filePath };
          }
          testStats[name].total++;
          if (assertion.status === 'passed') {
            testStats[name].passed++;
          }
        }
      }
    } catch (error) {
      console.error(`Error processing report at ${reportPath}:`, error.message);
    }
  }
  return statsByModel;
}

/**
 * Fetches historical nightly data using the GitHub CLI.
 * @returns {Array<{runId: string, stats: Record<string, any>}>} history
 */
export function fetchNightlyHistory(lookbackCount) {
  const history = [];
  try {
    const cmd = `gh run list --workflow evals-nightly.yml --branch main --limit ${
      lookbackCount + 2
    } --json databaseId,status`;
    const runsJson = execSync(cmd, { encoding: 'utf-8' });
    let runs = JSON.parse(runsJson);

    // Filter for completed runs and take the top N
    runs = runs.filter((r) => r.status === 'completed').slice(0, lookbackCount);

    for (const run of runs) {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `gemini-evals-hist-${run.databaseId}-`),
      );
      try {
        execSync(
          `gh run download ${run.databaseId} -p "eval-logs-*" -D "${tmpDir}"`,
          { stdio: 'ignore' },
        );

        const runReports = findReports(tmpDir);
        if (runReports.length > 0) {
          history.push({
            runId: run.databaseId,
            stats: getStatsFromReports(runReports),
          });
        }
      } catch (error) {
        console.error(
          `Failed to process artifacts for run ${run.databaseId}:`,
          error.message,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error('Failed to fetch history:', error.message);
  }
  return history;
}
