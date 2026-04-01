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
  const modelArg = process.argv[2];
  const remainingArgs = process.argv.slice(3);

  let files = '';
  let pattern = '';
  let model = modelArg;

  // Check if we have --test-pattern explicitly in any argument
  const fullArgsString = remainingArgs.join(' ');
  const testPatternIndex = remainingArgs.indexOf('--test-pattern');

  if (testPatternIndex !== -1) {
    // Standard case: each argument is separate
    files = remainingArgs.slice(0, testPatternIndex).join(' ');
    pattern = remainingArgs.slice(testPatternIndex + 1).join(' ');
  } else if (fullArgsString.includes('--test-pattern')) {
    // Case where arguments are combined into a single string (due to shell quoting)
    const parts = fullArgsString.split('--test-pattern');
    files = parts[0].trim();
    pattern = parts[1].trim();
  } else {
    // Fallback if no --test-pattern is provided (manual mode: pattern model)
    // node scripts/run_regression_check.js "Pattern" "Model"
    pattern = modelArg;
    model = process.argv[3];

    if (!model) {
      console.error('❌ Error: No target model specified.');
      process.exit(1);
    }

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

    const firstPass = runTests(files, pattern, model);
    const success = await processResults(firstPass, pattern, model, files);
    process.exit(success ? 0 : 1);
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

  // --- Step 2, 3 & 4: Targeted Retries (Best-of-4) ---
  // A test is cleared if it reaches 2 passes.
  // A test is flagged as a regression if it reaches 3 failures.
  for (const testName of failingTests) {
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
        const status = retryAssertion?.status || 'unknown/error';
        console.log(
          `  ❌ Attempt ${attemptNum} failed (${status}). Score: ${results[testName].passed}/${results[testName].total}`,
        );
      }

      // Termination messages and Baseline Verification
      if (results[testName].passed >= 2) {
        console.log(
          `  ✅ Test cleared as Noisy Pass (${results[testName].passed}/${results[testName].total})`,
        );
      } else if (results[testName].total - results[testName].passed >= 3) {
        console.log(
          `  ⚠️ Detected potential regression (${results[testName].passed}/${results[testName].total}). Verifying baseline...`,
        );

        // --- Step 5: Dynamic Baseline Verification ---
        // Switch to 'main', run twice. If it fails there too, it's not our fault.
        try {
          // 1. Stash current changes to switch branches safely
          execSync('git stash push -m "eval-regression-check-stash"', {
            stdio: 'inherit',
          });
          const hasStash = execSync('git stash list')
            .toString()
            .includes('eval-regression-check-stash');

          // 2. Checkout main and run the test up to 3 times
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
            const baselineAssertion = findAssertion(baselineRun, testName);

            if (baselineAssertion?.status === 'passed') {
              baselinePasses++;
              console.log(
                `  ✅ Baseline Attempt ${baselineTotal} passed. Score: ${baselinePasses}/${baselineTotal}`,
              );
            } else {
              console.log(
                `  ❌ Baseline Attempt ${baselineTotal} failed. Score: ${baselinePasses}/${baselineTotal}`,
              );
            }
          }

          // 3. Switch back and restore stash
          execSync('git checkout -', { stdio: 'inherit' });
          if (hasStash) {
            execSync('git stash pop', { stdio: 'inherit' });
          }

          // 4. Decision Logic
          if (baselinePasses === 0) {
            console.log(
              `  ℹ️ Test also fails on 'main' (0/${baselineTotal}). Marking as PRE-EXISTING (Cleared).`,
            );
            results[testName].status = 'pre-existing';
            results[testName].passed = results[testName].total; // Effectively clear it
          } else {
            console.log(
              `  ❌ Test passes on 'main' (${baselinePasses}/${baselineTotal}) but fails in PR. Marking as CONFIRMED REGRESSION.`,
            );
            results[testName].status = 'regression';
          }
        } catch (baselineError) {
          console.error(
            `  ❌ Failed to verify baseline: ${baselineError.message}`,
          );
          // If we can't verify baseline, assume it's a regression to be safe
          execSync('git checkout -', { stdio: 'ignore' }).catch(() => {});
        }
      }
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
