/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Compares PR evaluation results against historical nightly baselines.
 *
 * This script generates a Markdown report for use in PR comments. It aligns with
 * the 6-day lookback logic to show accurate historical pass rates and filters out
 * pre-existing or noisy failures to ensure only actionable regressions are reported.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchNightlyHistory } from './eval_utils.js';

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
  const history = fetchNightlyHistory(6); // Use same 6-day lookback
  const latestNightly = aggregateHistoricalStats(history, targetModel);

  const regressions = [];
  const passes = [];

  for (const [testName, pr] of Object.entries(prReport.results)) {
    const prRate = pr.passed / pr.total;
    if (pr.status === 'regression' || (prRate <= 0.34 && !pr.status)) {
      // Use relative path from workspace root
      const relativeFile = pr.file
        ? path.relative(process.cwd(), pr.file)
        : 'evals/';

      regressions.push({
        name: testName,
        file: relativeFile,
        nightly: latestNightly[testName]
          ? (latestNightly[testName].passRate * 100).toFixed(0) + '%'
          : 'N/A',
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
      'The following trustworthy evaluations passed on **`main`** and in **recent Nightly runs**, but failed in this PR. These regressions must be addressed before merging.\n\n';

    markdown += '| Test Name | Nightly | PR Result | Status |\n';
    markdown += '| :--- | :---: | :---: | :--- |\n';
    for (const r of regressions) {
      markdown += `| ${r.name} | ${r.nightly} | ${r.pr} | ❌ **Regression** |\n`;
    }
    markdown += `\n*The check passed or was cleared for ${passes.length} other trustworthy evaluations.*\n\n`;

    markdown += '<details>\n';
    markdown +=
      '<summary><b>🛠️ Troubleshooting & Fix Instructions</b></summary>\n\n';

    for (let i = 0; i < regressions.length; i++) {
      const r = regressions[i];
      if (regressions.length > 1) {
        markdown += `### Failure ${i + 1}: ${r.name}\n\n`;
      }

      markdown += '#### 1. Ask Gemini CLI to fix it (Recommended)\n';
      markdown += 'Copy and paste this prompt to the agent:\n';
      markdown += '```text\n';
      markdown += `The eval "${r.name}" in ${r.file} is failing. Investigate and fix it using the behavioral-evals skill.\n`;
      markdown += '```\n\n';

      markdown += '#### 2. Reproduce Locally\n';
      markdown += 'Run the following command to see the failure trajectory:\n';
      markdown += '```bash\n';
      const pattern = r.name.replace(/'/g, '.');
      markdown += `GEMINI_MODEL=${targetModel} npm run test:all_evals -- ${r.file} --testNamePattern="${pattern}"\n`;

      markdown += '```\n\n';

      if (i < regressions.length - 1) {
        markdown += '---\n\n';
      }
    }

    markdown += '#### 3. Manual Fix\n';
    markdown +=
      'See the [Fixing Guide](https://github.com/google-gemini/gemini-cli/blob/main/evals/README.md#fixing-evaluations) for detailed troubleshooting steps.\n';
    markdown += '</details>\n';

    process.stdout.write(markdown);
  } else if (passes.length > 0) {
    // Success State
    process.stdout.write(
      `✅ **${passes.length}** tests passed successfully on **${targetModel}**.\n`,
    );
  }
}

/**
 * Aggregates stats from history for a specific model.
 */
function aggregateHistoricalStats(history, model) {
  const stats = {};
  for (const item of history) {
    const modelStats = item.stats[model];
    if (!modelStats) continue;

    for (const [testName, stat] of Object.entries(modelStats)) {
      if (!stats[testName]) stats[testName] = { passed: 0, total: 0 };
      stats[testName].passed += stat.passed;
      stats[testName].total += stat.total;
    }
  }

  for (const name in stats) {
    stats[name].passRate = stats[name].passed / stats[name].total;
  }
  return stats;
}

main();
