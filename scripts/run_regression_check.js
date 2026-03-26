/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { quote } from 'shell-quote';
import { escapeRegex } from './eval_utils.js';

/**
 * Runs a set of tests using Vitest and returns the results.
 */
function runTests(files, pattern, model) {
  const outputDir = path.resolve(
    process.cwd(),
    `evals/logs/pr-run-${Date.now()}`,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const filesToRun = files || 'evals/';
  console.log(
    `🚀 Running tests in ${filesToRun} with pattern: ${pattern?.slice(0, 100)}...`,
  );

  try {
    // We use JSON reporter to parse results easily
    // We pass the files explicitly to Vitest to make it faster
    const cmd = `npx vitest run --config evals/vitest.config.ts ${filesToRun} -t "${pattern}" --reporter=json --reporter=default --outputFile="${path.join(outputDir, 'report.json')}"`;
    execSync(cmd, {
      stdio: 'inherit',
      env: {
        ...process.env,
        RUN_EVALS: '1',
        GEMINI_MODEL: model,
      },
    });
  } catch (_error) {
    // Vitest exits with non-zero if tests fail, which is expected
  }

  const reportPath = path.join(outputDir, 'report.json');
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
}

/**
 * Helper to find a specific assertion by name across all test files.
 */
function findAssertion(report, testName) {
  if (!report?.testResults) return null;
  for (const fileResult of report.testResults) {
    const assertion = fileResult.assertionResults.find(
      (a) => a.title === testName,
    );
    if (assertion) return assertion;
  }
  return null;
}

/**
 * Main execution logic.
 */
async function main() {
  const model = process.argv[2];

  // The rest of arguments are FILE_LIST --test-pattern TEST_PATTERN
  const args = process.argv.slice(3);
  const testPatternIndex = args.indexOf('--test-pattern');

  let files = '';
  let pattern = '';

  if (testPatternIndex !== -1) {
    files = args.slice(0, testPatternIndex).join(' ');
    pattern = args.slice(testPatternIndex + 1).join(' ');
  } else {
    // Fallback if no --test-pattern is provided (pattern is first arg, model is second)
    // To support the manual test: node scripts/run_regression_check.js "Pattern" "Model"
    pattern = process.argv[2];
    const manualModel = process.argv[3];
    if (manualModel) {
      // Try to find the file surgically to avoid scanning everything
      try {
        const grepResult = execSync(
          `grep -l ${quote([pattern])} evals/*.eval.ts`,
          { encoding: 'utf-8' },
        );
        files = grepResult.split('\n').filter(Boolean).join(' ');
      } catch (_e) {
        // Fallback to evals/ if grep fails
        files = 'evals/';
      }
      const firstPass = runTests(files, pattern, manualModel);
      const success = await processResults(
        firstPass,
        pattern,
        manualModel,
        files,
      );
      process.exit(success ? 0 : 1);
    }
  }

  if (!model) {
    console.error('❌ Error: No target model specified.');
    process.exit(1);
  }

  if (!pattern) {
    console.log('No trustworthy tests to run.');
    process.exit(0);
  }

  // --- Step 1: The Optimistic Run (N=1) ---
  console.log('\n--- Step 1: Optimistic Run (N=1) ---');
  const firstPass = runTests(files, pattern, model);
  const success = await processResults(firstPass, pattern, model, files);
  process.exit(success ? 0 : 1);
}

async function processResults(firstPass, pattern, model, files) {
  if (!firstPass) {
    console.error('Failed to get results from the first pass.');
    return false;
  }

  const results = {}; // { [testName]: { passed: number, total: number } }
  const failingTests = [];
  let totalProcessed = 0;

  for (const fileResult of firstPass.testResults) {
    for (const assertion of fileResult.assertionResults) {
      const name = assertion.title;
      if (assertion.status === 'passed') {
        results[name] = { passed: 1, total: 1 };
        totalProcessed++;
      } else if (assertion.status === 'failed') {
        results[name] = { passed: 0, total: 1 };
        failingTests.push(name);
        totalProcessed++;
      }
      // Statuses like 'skipped' or 'todo' are ignored
    }
  }

  if (totalProcessed === 0) {
    console.error(
      '❌ Error: No matching tests were found or executed. Please check your test name pattern.',
    );
    return false;
  }

  if (failingTests.length === 0) {
    console.log('✅ All trustworthy tests passed on the first try!');
    saveResults(results);
    return true;
  }

  console.log(`⚠️ ${failingTests.length} tests failed. Starting retries...`);

  // --- Step 2 & 3: Targeted Retries ---
  // We process each failing test individually to implement fail-fast logic
  for (const testName of failingTests) {
    console.log(`\nRe-evaluating: ${testName}`);

    // Retry 1
    const retry1 = runTests(files, escapeRegex(testName), model);
    const retry1Assertion = findAssertion(retry1, testName);
    const passedRetry1 = retry1Assertion?.status === 'passed';

    if (passedRetry1) {
      results[testName].passed++;
      results[testName].total++;

      // Step 3: Tie-breaker
      console.log('  Attempt 2 passed. Running tie-breaker...');
      const retry2 = runTests(files, escapeRegex(testName), model);
      const retry2Assertion = findAssertion(retry2, testName);
      const passedRetry2 = retry2Assertion?.status === 'passed';

      if (passedRetry2) {
        results[testName].passed++;
        console.log('  ✅ Tie-breaker passed. (2/3)');
      } else {
        console.log('  ❌ Tie-breaker failed. (1/3)');
      }
      results[testName].total++;
    } else if (retry1Assertion?.status === 'failed') {
      // Fail-fast: 0/2 is already a regression
      results[testName].total++;
      console.log('  ❌ Attempt 2 failed. (0/2) - Marking as regression.');
    } else {
      console.log(
        `  ⚠️ Attempt 2 skipped or returned unknown status (${retry1Assertion?.status}). (Total runs so far: 1)`,
      );
    }
  }

  saveResults(results);
  return true; // We return true because we successfully ran the analysis, even if regressions were found
}

function saveResults(results) {
  const finalReport = {
    timestamp: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    'evals/logs/pr_final_report.json',
    JSON.stringify(finalReport, null, 2),
  );
  console.log('\nFinal report saved to evals/logs/pr_final_report.json');
}

main();
