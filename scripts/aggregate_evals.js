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

// Extract policies from the source code
function getTestPolicies() {
  const policies = {};
  try {
    const evalFiles = fs
      .readdirSync('evals')
      .filter((f) => f.endsWith('.eval.ts'));
    for (const file of evalFiles) {
      const content = fs.readFileSync(path.join('evals', file), 'utf-8');
      const matches = content.matchAll(
        /evalTest\s*\(\s*['"](ALWAYS_PASSES|USUALLY_PASSES)['"]\s*,\s*\{\s*name:\s*['"](.+?)['"]/g,
      );
      for (const match of matches) {
        policies[match[2]] = match[1];
      }
    }
  } catch {
    // Ignore errors in policy extraction
  }
  return policies;
}

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
  const policies = getTestPolicies();

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

    let blockerRegression = false;
    for (const model of models) {
      const currentStats = currentStatsByModel[model];
      const baselineStats = getConsolidatedBaseline(model);
      for (const [name, curr] of Object.entries(currentStats)) {
        const policy = policies[name] || 'USUALLY_PASSES';
        const currRate = (curr.passed / curr.total) * 100;
        const base = baselineStats ? baselineStats[name] : null;
        const baseRate = base ? (base.passed / base.total) * 100 : null;

        if (policy === 'ALWAYS_PASSES' && currRate < 100) {
          blockerRegression = true;
        } else if (
          policy === 'USUALLY_PASSES' &&
          baseRate !== null &&
          baseRate > 90 &&
          currRate < 60
        ) {
          blockerRegression = true; // Significant drop in a highly stable test
        }
      }
    }

    if (blockerRegression) {
      console.log('**Status: 🔴 Regression Detected (Blocking)**\n');
      console.log(
        'This PR has introduced regressions in stable behavioral evaluations. These must be resolved before merging.\n',
      );
    } else {
      console.log('**Status: ✅ Stable**\n');
      console.log(
        'Behavioral evaluations remain stable compared to the `main` baseline.\n',
      );
    }

    console.log(
      `> **Note:** Baseline is averaged from the last ${history.length} healthy nightly runs on \`main\`.\n`,
    );
  } else {
    console.log('### Evals Nightly Summary\n');
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
      const policy = policies[name] || 'USUALLY_PASSES';
      const searchUrl = `https://github.com/search?q=repo%3Agoogle-gemini%2Fgemini-cli%20%22${encodeURIComponent(name)}%22&type=code`;
      const curr = currentStats[name];
      const base = baselineStats ? baselineStats[name] : null;

      const currRate = curr ? (curr.passed / curr.total) * 100 : null;
      const baseRate = base ? (base.passed / base.total) * 100 : null;
      const delta =
        currRate !== null && baseRate !== null ? currRate - baseRate : null;

      // Smart Noise Filtering
      let status = '⚪ Stable';
      let isInteresting = false;

      if (policy === 'ALWAYS_PASSES') {
        if (currRate !== null && currRate < 100) {
          status = '🔴 Regression';
          isInteresting = true;
        }
      } else {
        // USUALLY_PASSES: Only interesting if drop is > 30% OR it's a new failure
        if (delta !== null && delta < -30) {
          status = '🔴 Regression';
          isInteresting = true;
        } else if (delta !== null && delta > 30) {
          status = '🟢 Improved';
          isInteresting = true;
        } else if (baseRate !== null && baseRate > 80 && currRate === 0) {
          status = '🔴 Regression';
          isInteresting = true;
        }
      }

      // Always show new or missing tests
      if (currRate === null || baseRate === null) isInteresting = true;

      if (isPrComment && !isInteresting) {
        stableCount++;
        continue;
      }

      let row = `| [${name}](${searchUrl}) | ${policy === 'ALWAYS_PASSES' ? '🔒' : '🎲'} |`;

      if (!isPrComment) {
        for (const item of reversedHistory) {
          const stat = item.stats[model] ? item.stats[model][name] : null;
          row += ` ${stat ? ((stat.passed / stat.total) * 100).toFixed(0) + '%' : '-'} |`;
        }
      } else if (baselinePassRate !== null) {
        row += ` ${formatPassRate(baseRate)} |`;
      }

      row += ` ${formatPassRate(currRate)} | ${status} |`;
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
    }

    if (isPrComment && rows.length === 0) {
      console.log('✅ All behavioral evaluations are stable.\n');
      continue;
    }

    let header = `| Test Name | Policy |`;
    let separator = `| :--- | :---: |`;

    if (!isPrComment) {
      for (const item of reversedHistory) {
        header += ` [${item.run.databaseId}](${item.run.url}) |`;
        separator += ' :---: |';
      }
    } else if (baselinePassRate !== null) {
      header += ' Baseline |';
      separator += ' :---: |';
    }

    header += ' Current | Impact |';
    separator += ' :---: | :---: |';

    console.log(header);
    console.log(separator);
    rows.forEach((row) => console.log(row));

    if (isPrComment && stableCount > 0) {
      console.log(
        `\n> **Note:** ${stableCount} stable tests were hidden from this report.\n`,
      );
    }
    console.log('\n');
  }

  if (isPrComment) {
    console.log(
      '---\n💡 **Policy Key:** 🔒 `ALWAYS_PASSES` (PR Blocker) | 🎲 `USUALLY_PASSES` (Informational)\n',
    );
    console.log(
      '💡 To investigate regressions locally, run: `gemini /fix-behavioral-eval`',
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
