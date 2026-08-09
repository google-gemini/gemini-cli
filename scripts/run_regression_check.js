/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Executes a high-signal regression check for behavioral evaluations.
 *
 * This script runs a targeted set of stable tests in an optimistic first pass.
 * If failures occur, it employs a "Best-of-4" retry logic to handle natural flakiness.
 * For confirmed failures (0/3), it performs Dynamic Baseline Verification by
 * checking the failure against the 'main' branch to distinguish between
 * model drift and PR-introduced regressions.
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
    const cmd = `npx vitest run --config evals/vitest.config.ts ${filesToRun} -t "${pattern}" --reporter=json --reporter=default --outputFile="${path.join(outputDir, 'report.json')}"`;
    execSync(cmd, {
      stdio: 'inherit',
      env: { ...process.env, RUN_EVALS: '1', GEMINI_MODEL: model },
    });
  } catch {
    // Vitest returns a non-zero exit code when tests fail. This is expected.
    // We continue execution and handle the failures by parsing the JSON report.
  }

  const reportPath = path.join(outputDir, 'report.json');
  return fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
    : null;
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
 * Parses command line arguments to identify model, files, and test pattern.
 */
function parseArgs() {
  const modelArg = process.argv[2];
  const remainingArgs = process.argv.slice(3);
  const fullArgsString = remainingArgs.join(' ');
  const testPatternIndex = remainingArgs.indexOf('--test-pattern');

  if (testPatternIndex !== -1) {
    return {
      model: modelArg,
      files: remainingArgs.slice(0, testPatternIndex).join(' '),
      pattern: remainingArgs.slice(testPatternIndex + 1).join(' '),
    };
  }

  if (fullArgsString.includes('--test-pattern')) {
    const parts = fullArgsString.split('--test-pattern');
    return {
      model: modelArg,
      files: parts[0].trim(),
      pattern: parts[1].trim(),
    };
  }

  // Fallback for manual mode: Pattern Model
  const manualPattern = process.argv[2];
  const manualModel = process.argv[3];
  if (!manualModel) {
    console.error('❌ Error: No target model specified.');
    process.exit(1);
  }

  let manualFiles = 'evals/';
  try {
    const grepResult = execSync(
      `grep -l ${quote([manualPattern])} evals/*.eval.ts`,
      { encoding: 'utf-8' },
    );
    manualFiles = grepResult.split('\n').filter(Boolean).join(' ');
  } catch {
    // Grep returns exit code 1 if no files match the pattern.
    // In this case, we fall back to scanning all files in the evals/ directory.
  }

  return {
    model: manualModel,
    files: manualFiles,
    pattern: manualPattern,
    isManual: true,
  };
}

/**
 * Runs the targeted retry logic (Best-of-4) for a failing test.
 */
async function runRetries(testName, results, files, model) {
  console.log(`\nRe-evaluating: ${testName}`);

  while (
    results[testName].passed < 2 &&
    results[testName].total - results[testName].passed < 3 &&
    results[testName].total < 4
  ) {
    const attemptNum = results[testName].total + 1;
    console.log(`  Running attempt ${attemptNum}...`);

    const retry = runTests(files, escapeRegex(testName), model);
    const retryAssertion = findAssertion(retry, testName);

    results[testName].total++;
    if (retryAssertion?.status === 'passed') {
      results[testName].passed++;
      console.log(
        `  ✅ Attempt ${attemptNum} passed. Score: ${results[testName].passed}/${results[testName].total}`,
      );
    } else {
      console.log(
        `  ❌ Attempt ${attemptNum} failed (${retryAssertion?.status || 'unknown'}). Score: ${results[testName].passed}/${results[testName].total}`,
      );
    }

    if (results[testName].passed >= 2) {
      console.log(
        `  ✅ Test cleared as Noisy Pass (${results[testName].passed}/${results[testName].total})`,
      );
    } else if (results[testName].total - results[testName].passed >= 3) {
      await verifyBaseline(testName, results, files, model);
    }
  }
}

/**
 * Verifies a potential regression against the 'main' branch.
 */
async function verifyBaseline(testName, results, files, model) {
  console.log('\n--- Step 3: Dynamic Baseline Verification ---');
  console.log(
    `⚠️ Potential regression detected. Verifying baseline on 'main'...`,
  );

  try {
    execSync('git stash push -m "eval-regression-check-stash"', {
      stdio: 'inherit',
    });
    const hasStash = execSync('git stash list')
      .toString()
      .includes('eval-regression-check-stash');
    execSync('git checkout main', { stdio: 'inherit' });

    console.log(
      `\n--- Running Baseline Verification on 'main' (Best-of-3) ---`,
    );
    let baselinePasses = 0;
    let baselineTotal = 0;

    while (baselinePasses === 0 && baselineTotal < 3) {
      baselineTotal++;
      console.log(`  Baseline Attempt ${baselineTotal}...`);
      const baselineRun = runTests(files, escapeRegex(testName), model);
      if (findAssertion(baselineRun, testName)?.status === 'passed') {
        baselinePasses++;
        console.log(`  ✅ Baseline Attempt ${baselineTotal} passed.`);
      } else {
        console.log(`  ❌ Baseline Attempt ${baselineTotal} failed.`);
      }
    }

    execSync('git checkout -', { stdio: 'inherit' });
    if (hasStash) execSync('git stash pop', { stdio: 'inherit' });

    if (baselinePasses === 0) {
      console.log(
        `  ℹ️ Test also fails on 'main'. Marking as PRE-EXISTING (Cleared).`,
      );
      results[testName].status = 'pre-existing';
      results[testName].passed = results[testName].total; // Clear for report
    } else {
      console.log(
        `  ❌ Test passes on 'main' but fails in PR. Marking as CONFIRMED REGRESSION.`,
      );
      results[testName].status = 'regression';
    }
  } catch (error) {
    console.error(`  ❌ Failed to verify baseline: ${error.message}`);

    // Best-effort cleanup: try to return to the original branch.
    try {
      execSync('git checkout -', { stdio: 'ignore' });
    } catch {
      // Ignore checkout errors during cleanup to avoid hiding the original error.
    }
  }
}

/**
 * Processes initial results and orchestrates retries/baseline checks.
 */
async function processResults(firstPass, pattern, model, files) {
  if (!firstPass) return false;

  const results = {};
  const failingTests = [];
  let totalProcessed = 0;

  for (const fileResult of firstPass.testResults) {
    for (const assertion of fileResult.assertionResults) {
      if (assertion.status !== 'passed' && assertion.status !== 'failed') {
        continue;
      }

      const name = assertion.title;
      results[name] = {
        passed: assertion.status === 'passed' ? 1 : 0,
        total: 1,
        file: fileResult.name,
      };
      if (assertion.status === 'failed') failingTests.push(name);
      totalProcessed++;
    }
  }

  if (totalProcessed === 0) {
    console.error('❌ Error: No matching tests were found or executed.');
    return false;
  }

  if (failingTests.length === 0) {
    console.log('✅ All trustworthy tests passed on the first try!');
  } else {
    console.log('\n--- Step 2: Best-of-4 Retries ---');
    console.log(
      `⚠️ ${failingTests.length} tests failed the optimistic run. Starting retries...`,
    );
    for (const testName of failingTests) {
      await runRetries(testName, results, files, model);
    }
  }

  saveResults(results);
  return true;
}

function saveResults(results) {
  const finalReport = { timestamp: new Date().toISOString(), results };
  fs.writeFileSync(
    'evals/logs/pr_final_report.json',
    JSON.stringify(finalReport, null, 2),
  );
  console.log('\nFinal report saved to evals/logs/pr_final_report.json');
}

async function main() {
  const { model, files, pattern, isManual } = parseArgs();

  if (isManual) {
    const firstPass = runTests(files, pattern, model);
    const success = await processResults(firstPass, pattern, model, files);
    process.exit(success ? 0 : 1);
  }

  if (!pattern) {
    console.log('No trustworthy tests to run.');
    process.exit(0);
  }

  console.log('\n--- Step 1: Optimistic Run (N=1) ---');
  const firstPass = runTests(files, pattern, model);
  const success = await processResults(firstPass, pattern, model, files);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
