/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { findReports, getModelFromPath } from './eval_utils.js';

/**
 * Main execution logic.
 */
function main() {
  const prReportPath = 'evals/logs/pr_final_report.json';
  const targetModel = process.argv[2];

  if (!targetModel) {
    console.error('❌ Error: No target model specified.');
    process.exit(1);
  }

  if (!fs.existsSync(prReportPath)) {
    console.error('No PR report found.');
    return;
  }

  const prReport = JSON.parse(fs.readFileSync(prReportPath, 'utf-8'));
  const latestNightly = fetchLatestNightlyStats(targetModel);

  const regressions = [];
  const passes = [];

  for (const [testName, pr] of Object.entries(prReport.results)) {
    const prRate = pr.passed / pr.total;
    const nightlyStats = latestNightly[testName];
    const nightlyRate = nightlyStats ? nightlyStats.passRate : null;

    // Regression check: dropped to 33% (1/3) or 0%
    if (prRate <= 0.34) {
      regressions.push({
        name: testName,
        nightly:
          nightlyRate !== null
            ? (nightlyRate * 100).toFixed(0) + '%'
            : 'No Data',
        pr: (prRate * 100).toFixed(0) + '%',
      });
    } else {
      passes.push(testName);
    }
  }

  if (regressions.length > 0) {
    let markdown = '### ⚠️ Eval Regression Warning\n\n';
    markdown += `**Model:** \`${targetModel}\`\n\n`;
    markdown += '| Test Name | Nightly Baseline | PR Result | Status |\n';
    markdown += '| :--- | :---: | :---: | :--- |\n';
    for (const r of regressions) {
      markdown += `| ${r.name} | ${r.nightly} | ${r.pr} | ❌ **Regression** |\n`;
    }
    markdown += `\n*The check passed on ${passes.length} other trustworthy evaluations.*\n`;
    process.stdout.write(markdown);
  }
}

/**
 * Fetches the latest successful nightly run stats for the model.
 */
function fetchLatestNightlyStats(model) {
  let tmpDir;
  try {
    const cmd = `gh run list --workflow evals-nightly.yml --branch main --limit 1 --json databaseId`;
    const run = JSON.parse(execSync(cmd, { encoding: 'utf-8' }))[0];
    if (!run) return {};

    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `eval-latest-${run.databaseId}-`),
    );
    execSync(
      `gh run download ${run.databaseId} -p "eval-logs-*" -D "${tmpDir}"`,
      {
        stdio: 'ignore',
      },
    );

    const stats = {};
    const reports = findReports(tmpDir);
    for (const reportPath of reports) {
      if (getModelFromPath(reportPath) !== model) continue;

      const json = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      for (const testResult of json.testResults) {
        for (const assertion of testResult.assertionResults) {
          const name = assertion.title;
          if (!stats[name]) stats[name] = { passed: 0, total: 0 };
          stats[name].total++;
          if (assertion.status === 'passed') stats[name].passed++;
        }
      }
    }

    for (const name in stats) {
      stats[name].passRate = stats[name].passed / stats[name].total;
    }
    return stats;
  } catch (error) {
    console.error('Failed to fetch latest nightly:', error);
    return {};
  } finally {
    if (typeof tmpDir !== 'undefined') {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Failed to clean up ${tmpDir}:`, cleanupError);
      }
    }
  }
}

main();
