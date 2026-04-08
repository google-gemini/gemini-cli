/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Identifies "Trustworthy" behavioral evaluations from nightly history.
 *
 * This script analyzes the last 6 days of nightly runs to find tests that meet
 * strict stability criteria (80% aggregate pass rate and 60% daily floor).
 * It outputs a list of files and a Vitest pattern used by the PR regression check
 * to ensure high-signal validation and minimize noise.
 */

import fs from 'node:fs';
import { fetchNightlyHistory, escapeRegex } from './eval_utils.js';

const LOOKBACK_COUNT = 6;
const MIN_VALID_RUNS = 5; // At least 5 out of 6 must be available
const PASS_RATE_THRESHOLD = 0.6; // Daily floor (e.g., 2/3)
const AGGREGATE_PASS_RATE_THRESHOLD = 0.8; // Weekly signal (e.g., 15/18)

/**
 * Main execution logic.
 */
function main() {
  const targetModel = process.argv[2];
  if (!targetModel || targetModel.startsWith('--')) {
    console.error('❌ Error: No target model specified.');
    process.exit(1);
  }

  // Parse --suites argument
  const suitesArgIndex = process.argv.indexOf('--suites');
  let requestedSuites = null;
  if (suitesArgIndex !== -1 && process.argv[suitesArgIndex + 1]) {
    requestedSuites = process.argv[suitesArgIndex + 1]
      .split(',')
      .map((s) => s.trim());
  }

  console.error(`🔍 Identifying trustworthy evals for model: ${targetModel}`);
  if (requestedSuites) {
    console.error(`📂 Filtering by suites: ${requestedSuites.join(', ')}`);
  }

  const history = fetchNightlyHistory(LOOKBACK_COUNT);
  if (history.length === 0) {
    console.error('❌ No historical data found.');
    process.exit(1);
  }

  // Load suites configuration
  let allowedFiles = null;
  let runAllStable = false;
  if (requestedSuites) {
    try {
      const suitesConfig = JSON.parse(
        fs.readFileSync('evals/suites.json', 'utf-8'),
      );
      allowedFiles = new Set();
      for (const suiteName of requestedSuites) {
        const suite = suitesConfig[suiteName];
        if (suite) {
          if (suite.evals.includes('ALL_ALWAYS_PASSING')) {
            runAllStable = true;
          } else {
            suite.evals.forEach((file) => allowedFiles.add(file));
          }
        }
      }
    } catch (e) {
      console.error(
        `⚠️ Warning: Could not load evals/suites.json or match suites: ${e.message}`,
      );
    }
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
      // Suite filtering logic
      let isFileAllowed = true;
      if (requestedSuites && !runAllStable) {
        if (info.file) {
          const match = info.file.match(/evals\/.*\.eval\.ts/);
          if (match && !allowedFiles.has(match[0])) {
            isFileAllowed = false;
          } else if (!match) {
            isFileAllowed = false;
          }
        } else {
          isFileAllowed = false;
        }
      }

      if (isFileAllowed) {
        trustworthyTests.push(testName);
        if (info.file) {
          const match = info.file.match(/evals\/.*\.eval\.ts/);
          if (match) {
            trustworthyFiles.add(match[0]);
          }
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
  if (volatileTests.length > 0) {
    console.error(`\n⚪ Ignored ${volatileTests.length} volatile tests.`);
  }
  if (newTests.length > 0) {
    console.error(
      `🆕 Ignored ${newTests.length} tests with insufficient history.`,
    );
  }

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
