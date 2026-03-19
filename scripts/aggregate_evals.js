#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const args = process.argv.slice(2);
const artifactsDir = args.find((arg) => !arg.startsWith('--')) || '.';
const isPrComment = args.includes('--pr-comment');
const MAX_HISTORY = 7;

// Find all report.json files recursively
function findReports(dir) {
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

function getModelFromPath(reportPath) {
  const parts = reportPath.split(path.sep);
  const artifactDir = parts.find((p) => p.startsWith('eval-logs-'));
  if (!artifactDir) return 'unknown';

  const matchNew = artifactDir.match(/^eval-logs-(.+)-(\d+)$/);
  if (matchNew) return matchNew[1];

  const matchOld = artifactDir.match(/^eval-logs-(\d+)$/);
  if (matchOld) return 'gemini-2.5-pro';

  return 'unknown';
}

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
        for (const assertion of testResult.assertionResults) {
          const name = assertion.title;
          if (!testStats[name]) {
            testStats[name] = { passed: 0, failed: 0, total: 0 };
          }
          testStats[name].total++;
          if (assertion.status === 'passed') {
            testStats[name].passed++;
          } else {
            testStats[name].failed++;
          }
        }
      }
    } catch (error) {
      console.error(`Error processing report at ${reportPath}:`, error);
    }
  }
  return statsByModel;
}

function fetchHistoricalData() {
  const history = [];

  try {
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch {
      if (!isPrComment) {
        console.warn(
          'Warning: GitHub CLI (gh) not found. Historical data will be unavailable.',
        );
      }
      return history;
    }

    const branch = 'main';

    const cmd = `gh run list --workflow evals-nightly.yml --branch "${branch}" --limit ${
      MAX_HISTORY + 10
    } --json databaseId,createdAt,url,displayTitle,status,conclusion`;
    const runsJson = execSync(cmd, { encoding: 'utf-8' });
    let runs = JSON.parse(runsJson);

    const currentRunId = process.env.GITHUB_RUN_ID;
    if (currentRunId) {
      runs = runs.filter((r) => r.databaseId.toString() !== currentRunId);
    }

    runs = runs
      .filter((r) => r.status === 'completed')
      .slice(0, MAX_HISTORY + 5);

    for (const run of runs) {
      if (history.length >= MAX_HISTORY) break;

      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `gemini-evals-${run.databaseId}-`),
      );
      try {
        execSync(
          `gh run download ${run.databaseId} -p "eval-logs-*" -D "${tmpDir}"`,
          { stdio: 'ignore' },
        );

        const runReports = findReports(tmpDir);
        if (runReports.length > 0) {
          const stats = getStats(runReports);

          // --- Infrastructure Failure Check ---
          // If the overall pass rate for this run is 0%, ignore it as a "poisoned" baseline.
          let totalPassed = 0;
          let totalTests = 0;
          Object.values(stats).forEach((modelStats) => {
            Object.values(modelStats).forEach((s) => {
              totalPassed += s.passed;
              totalTests += s.total;
            });
          });

          if (totalTests > 0 && totalPassed === 0) {
            continue;
          }

          history.push({ run, stats });
        }
      } catch {
        // Ignore download errors
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error('Failed to fetch historical data:', error);
  }

  return history;
}

function generateMarkdown(currentStatsByModel, history) {
  const reversedHistory = [...history].reverse();
  const models = Object.keys(currentStatsByModel).sort();

  const getConsolidatedBaseline = (model) => {
    const consolidated = {};
    for (const item of history) {
      const stats = item.stats[model];
      if (!stats) continue;
      for (const [name, stat] of Object.entries(stats)) {
        if (!consolidated[name]) {
          consolidated[name] = { passed: 0, total: 0 };
        }
        consolidated[name].passed += stat.passed;
        consolidated[name].total += stat.total;
      }
    }
    return Object.keys(consolidated).length > 0 ? consolidated : null;
  };

  const getPassRate = (statsForModel) => {
    if (!statsForModel) return null;
    const totalStats = Object.values(statsForModel).reduce(
      (acc, stats) => {
        acc.passed += stats.passed;
        acc.total += stats.total;
        return acc;
      },
      { passed: 0, total: 0 },
    );
    return totalStats.total > 0
      ? (totalStats.passed / totalStats.total) * 100
      : null;
  };

  const formatPassRate = (rate) =>
    rate === null ? '-' : rate.toFixed(1) + '%';

  if (isPrComment) {
    console.log('### 🤖 Model Steering Impact Report\n');

    let overallRegression = false;
    for (const model of models) {
      const currentStats = currentStatsByModel[model];
      const baselineStats = getConsolidatedBaseline(model);
      for (const [name, curr] of Object.entries(currentStats)) {
        const base = baselineStats ? baselineStats[name] : null;
        if (base) {
          const delta =
            (curr.passed / curr.total) * 100 - (base.passed / base.total) * 100;
          if (delta < -15) overallRegression = true;
        }
      }
    }

    if (overallRegression) {
      console.log('**Status: ⚠️ Investigation Recommended**\n');
      console.log(
        'This PR modifies core prompt or tool logic and has introduced significant regressions in behavioral stability. Please review the delta below.\n',
      );
    } else {
      console.log('**Status: ✅ Stable**\n');
      console.log(
        'This PR modifies core prompt or tool logic. Behavioral evaluations remain stable compared to the `main` baseline.\n',
      );
    }

    console.log(
      `> **Note:** The baseline is an average of the last ${history.length} healthy nightly runs on \`main\` (ignoring infrastructure failures).\n`,
    );
  } else {
    console.log('### Evals Nightly Summary\n');
    console.log(
      'See [evals/README.md](https://github.com/google-gemini/gemini-cli/tree/main/evals) for more details.\n',
    );
  }

  for (const model of models) {
    const currentStats = currentStatsByModel[model];
    const currentPassRate = getPassRate(currentStats);
    const baselineStats = getConsolidatedBaseline(model);
    const baselinePassRate = getPassRate(baselineStats);

    console.log(`#### Model: ${model}`);

    const allTestNames = new Set(Object.keys(currentStats));
    if (baselineStats) {
      Object.keys(baselineStats).forEach((name) => allTestNames.add(name));
    }

    const rows = [];
    let stableCount = 0;

    for (const name of Array.from(allTestNames).sort()) {
      const searchUrl = `https://github.com/search?q=repo%3Agoogle-gemini%2Fgemini-cli%20%22${encodeURIComponent(name)}%22&type=code`;
      const curr = currentStats[name];
      const base = baselineStats ? baselineStats[name] : null;

      const currRate = curr ? (curr.passed / curr.total) * 100 : null;
      const baseRate = base ? (base.passed / base.total) * 100 : null;

      const delta =
        currRate !== null && baseRate !== null ? currRate - baseRate : null;
      const isInteresting =
        currRate === null || baseRate === null || Math.abs(delta) >= 15;

      if (isPrComment && !isInteresting) {
        stableCount++;
        continue;
      }

      let row = `| [${name}](${searchUrl}) |`;

      if (!isPrComment) {
        for (const item of reversedHistory) {
          const stat = item.stats[model] ? item.stats[model][name] : null;
          row += ` ${stat ? ((stat.passed / stat.total) * 100).toFixed(0) + '%' : '-'} |`;
        }
      } else if (baselinePassRate !== null) {
        row += ` ${formatPassRate(baseRate)} (${base?.total || 0}n) |`;
      }

      row += ` ${formatPassRate(currRate)} (${curr?.total || 0}n) |`;

      if (delta !== null) {
        if (delta > 10) row += ` 🟢 +${delta.toFixed(0)}% |`;
        else if (delta < -15) row += ` 🔴 ${delta.toFixed(0)}% |`;
        else row += ' ⚪ Stable |';
      } else {
        row += ' - |';
      }
      rows.push(row);
    }

    if (isPrComment && baselinePassRate !== null) {
      const delta = currentPassRate - baselinePassRate;
      const deltaStr =
        Math.abs(delta) < 5
          ? ' (Stable)'
          : ` (${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}%)`;
      console.log(
        `**Pass Rate: ${formatPassRate(currentPassRate)}** vs. ${formatPassRate(baselinePassRate)} Baseline${deltaStr}\n`,
      );
    } else if (!isPrComment) {
      console.log(`**Total Pass Rate: ${formatPassRate(currentPassRate)}**\n`);
    }

    if (isPrComment && rows.length === 0) {
      console.log(
        '✅ No interesting behavioral shifts detected for this model.\n',
      );
      continue;
    }

    let header = '| Test Name |';
    let separator = '| :--- |';

    if (!isPrComment) {
      for (const item of reversedHistory) {
        header += ` [${item.run.databaseId}](${item.run.url}) |`;
        separator += ' :---: |';
      }
    } else if (baselinePassRate !== null) {
      header += ' Baseline (Avg) |';
      separator += ' :---: |';
    }

    header += ' Current | Impact |';
    separator += ' :---: | :---: |';

    console.log(header);
    console.log(separator);
    rows.forEach((row) => console.log(row));

    if (isPrComment && stableCount > 0) {
      console.log(
        `\n> **Note:** ${stableCount} stable tests were hidden from this report to reduce noise.\n`,
      );
    }
    console.log('\n');
  }

  if (isPrComment) {
    console.log(
      '---\n💡 To investigate regressions locally, run: `gemini /fix-behavioral-eval`',
    );
  }
}

const currentReports = findReports(artifactsDir);
if (currentReports.length === 0) {
  console.log('No reports found.');
  process.exit(0);
}

const currentStats = getStats(currentReports);
const history = fetchHistoricalData();
generateMarkdown(currentStats, history);
