/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { findReports, getModelFromPath, escapeRegex } from './eval_utils.js';

const LOOKBACK_COUNT = 6;
const MIN_VALID_RUNS = 5; // At least 5 out of 6 must be available
const PASS_RATE_THRESHOLD = 0.6; // Daily floor (e.g., 2/3)
const AGGREGATE_PASS_RATE_THRESHOLD = 0.8; // Weekly signal (e.g., 15/18)

/**
 * Aggregates stats from a list of report.json files.
 */
function getStats(reports) {
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
      console.error(`Error processing report at ${reportPath}:`, error);
    }
  }
  return statsByModel;
}

/**
 * Fetches historical nightly data using the GitHub CLI.
 */
function fetchHistory() {
  const history = [];
  try {
    const cmd = `gh run list --workflow evals-nightly.yml --branch main --limit ${
      LOOKBACK_COUNT + 5
    } --json databaseId,status,conclusion`;
    const runsJson = execSync(cmd, { encoding: 'utf-8' });
    let runs = JSON.parse(runsJson);

    // Filter for completed runs and take the most recent LOOKBACK_COUNT
    runs = runs
      .filter((r) => r.status === 'completed')
      .slice(0, LOOKBACK_COUNT);

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
            stats: getStats(runReports),
          });
        }
      } catch (error) {
        console.error(
          `Failed to process artifacts for run ${run.databaseId}:`,
          error,
        );
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error(`Failed to clean up ${tmpDir}:`, cleanupError);
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch history:', error);
  }
  return history;
}

/**
 * Main execution logic.
 */
function main() {
  const targetModel = process.argv[2];
  if (!targetModel) {
    console.error('❌ Error: No target model specified.');
    process.exit(1);
  }
  console.error(`🔍 Identifying trustworthy evals for model: ${targetModel}`);

  const history = fetchHistory();
  if (history.length === 0) {
    console.error('❌ No historical data found.');
    process.exit(1);
  }

  // Aggregate results for the target model across all history
  const testHistories = {}; // { [testName]: { totalPassed: 0, totalRuns: 0, dailyRates: [], file: string } }

  for (const item of history) {
    const modelStats = item.stats[targetModel];
    if (!modelStats) continue;

    for (const [testName, stat] of Object.entries(modelStats)) {
      if (!testHistories[testName]) {
        testHistories[testName] = {
          totalPassed: 0,
          totalRuns: 0,
          dailyRates: [],
          file: stat.file,
        };
      }
      testHistories[testName].totalPassed += stat.passed;
      testHistories[testName].totalRuns += stat.total;
      testHistories[testName].dailyRates.push(stat.passed / stat.total);
    }
  }

  const trustworthyTests = [];
  const trustworthyFiles = new Set();
  const volatileTests = [];
  const newTests = [];

  for (const [testName, info] of Object.entries(testHistories)) {
    const dailyRates = info.dailyRates;
    const aggregateRate = info.totalPassed / info.totalRuns;

    // 1. Minimum data points required
    if (dailyRates.length < MIN_VALID_RUNS) {
      newTests.push(testName);
      continue;
    }

    // 2. Trustworthy Criterion:
    // - Every single day must be above the floor (e.g. > 60%)
    // - The overall aggregate must be high-signal (e.g. > 80%)
    const isDailyStable = dailyRates.every(
      (rate) => rate > PASS_RATE_THRESHOLD,
    );
    const isAggregateHighSignal = aggregateRate > AGGREGATE_PASS_RATE_THRESHOLD;

    if (isDailyStable && isAggregateHighSignal) {
      trustworthyTests.push(testName);
      if (info.file) {
        const match = info.file.match(/evals\/.*\.eval\.ts/);
        if (match) {
          trustworthyFiles.add(match[0]);
        }
      }
    } else {
      volatileTests.push(testName);
    }
  }

  console.error(
    `✅ Found ${trustworthyTests.length} trustworthy tests across ${trustworthyFiles.size} files:`,
  );
  trustworthyTests.sort().forEach((name) => console.error(`   - ${name}`));
  console.error(`\n⚪ Ignored ${volatileTests.length} volatile tests.`);
  console.error(
    `🆕 Ignored ${newTests.length} tests with insufficient history.`,
  );

  // Output the list of names as a regex-friendly pattern for vitest -t
  const pattern = trustworthyTests.map((name) => escapeRegex(name)).join('|');

  // Also output unique file paths as a space-separated string
  const files = Array.from(trustworthyFiles).join(' ');

  // Print the combined output to stdout for use in shell scripts (only if piped/CI)
  if (!process.stdout.isTTY) {
    // Format: FILE_LIST --test-pattern TEST_PATTERN
    // This allows the workflow to easily use it
    process.stdout.write(`${files} --test-pattern ${pattern || ''}\n`);
  } else {
    console.error(
      '\n💡 Note: Raw regex pattern and file list are hidden in interactive terminal. It will be printed when piped or in CI.',
    );
  }
}

main();
