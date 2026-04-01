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

    // Show ONLY if it is an explicit 'regression' (passed on main, failed in PR)
    // or if the pass rate is extremely low and no baseline was run.
    if (pr.status === 'regression' || (prRate <= 0.34 && !pr.status)) {
      regressions.push({
        name: testName,
        nightly: nightlyStats ? (nightlyRate * 100).toFixed(0) + '%' : 'N/A',
        pr: (prRate * 100).toFixed(0) + '%',
      });
    } else {
      passes.push(testName);
    }
  }

  if (regressions.length > 0) {
    let markdown = '### 🚨 Action Required: Eval Regressions Detected\n\n';
    markdown += `**Model:** \`${targetModel}\`\n\n`;
    markdown +=
      'The following trustworthy evaluations passed on `main` but failed in this PR. These regressions must be addressed before merging to maintain behavioral quality.\n\n';
    markdown += '| Test Name | Nightly (Baseline) | PR Result | Status |\n';
    markdown += '| :--- | :---: | :---: | :--- |\n';
    for (const r of regressions) {
      markdown += `| ${r.name} | ${r.nightly} | ${r.pr} | ❌ **Regression** |\n`;
    }
    markdown += `\n*The check passed or was cleared for ${passes.length} other trustworthy evaluations.*\n\n`;

    markdown += '### 🛠️ How to Fix\n\n';
    markdown +=
      '1. **Reproduce Locally:** Run the following command to see the failure trajectory:\n';
    markdown += '   ```bash\n';
    markdown += `   GEMINI_MODEL=${targetModel} npm run test:eval -- -t "${regressions[0].name}"\n`;
    markdown += '   ```\n';
    markdown +=
      '2. **Ask Gemini CLI:** You can ask the agent to fix it for you: `"The eval \'<test-name>\' is failing in my PR. Please investigate and fix it using the behavioral-evals skill."`\n';
    markdown +=
      '3. **Manual Fix:** Most regressions can be resolved by refining the instructions in `packages/core/src/prompts/` or adjusting tool descriptions. See the [Fixing Guide](https://github.com/google-gemini/gemini-cli/blob/main/evals/README.md#fixing-evaluations) for more details.\n';

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
