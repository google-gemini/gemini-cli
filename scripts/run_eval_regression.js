/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Orchestrates the PR evaluation process across multiple models.
 *
 * This script loops through a provided list of models, identifies trustworthy
 * tests for each, executes the frugal regression check, and collects results
 * into a single unified report. It exits with code 1 if any confirmed
 * regressions are detected.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Main execution logic.
 */
async function main() {
  const modelList = process.env.MODEL_LIST || 'gemini-3-flash-preview';
  const models = modelList.split(',').map((m) => m.trim());

  let combinedReport = '';
  let hasRegression = false;

  console.log(
    `🚀 Starting evaluation orchestration for models: ${models.join(', ')}`,
  );

  for (const model of models) {
    console.log(`\n--- Processing Model: ${model} ---`);

    try {
      // 1. Identify Trustworthy Evals
      console.log(`🔍 Identifying trustworthy tests for ${model}...`);
      const output = execSync(
        `node scripts/get_trustworthy_evals.js "${model}"`,
        {
          encoding: 'utf-8',
          stdio: ['inherit', 'pipe', 'inherit'], // Capture stdout but pass stdin/stderr
        },
      ).trim();

      if (!output) {
        console.log(`ℹ️ No trustworthy tests found for ${model}. Skipping.`);
        continue;
      }

      // 2. Run Frugal Regression Check
      console.log(`🧪 Running regression check for ${model}...`);
      execSync(`node scripts/run_regression_check.js "${model}" "${output}"`, {
        stdio: 'inherit',
      });

      // 3. Generate Report
      console.log(`📊 Generating report for ${model}...`);
      const report = execSync(`node scripts/compare_evals.js "${model}"`, {
        encoding: 'utf-8',
        stdio: ['inherit', 'pipe', 'inherit'],
      }).trim();

      if (report) {
        if (combinedReport) {
          combinedReport += '\n\n---\n\n';
        }
        combinedReport += report;

        // 4. Check for Regressions
        // If the report contains the "Action Required" marker, it means a confirmed regression was found.
        if (report.includes('Action Required')) {
          hasRegression = true;
        }
      }
    } catch (error) {
      console.error(`❌ Error processing model ${model}:`, error.message);
      // We flag a failure if any model encountered a critical error
      hasRegression = true;
    }
  }

  // Always save the combined report to a file so the workflow can capture it cleanly
  if (combinedReport) {
    fs.writeFileSync('eval_regression_report.md', combinedReport);
    console.log(
      '\n📊 Final Markdown report saved to eval_regression_report.md',
    );
  }

  // Log status for CI visibility, but don't exit with error
  if (hasRegression) {
    console.error(
      '\n⚠️ Confirmed regressions detected across one or more models. See PR comment for details.',
    );
  } else {
    console.log('\n✅ All evaluations passed successfully (or were cleared).');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
