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

const artifactsDir = process.argv[2] || '.';
const MAX_HISTORY = 10;

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
  // Find the part that starts with 'eval-logs-'
  const artifactDir = parts.find((p) => p.startsWith('eval-logs-'));
  if (!artifactDir) return 'unknown';

  const matchNew = artifactDir.match(/^eval-logs-(.+)-(\d+)$/);
  if (matchNew) return matchNew[1];

  const matchOld = artifactDir.match(/^eval-logs-(\d+)$/);
  if (matchOld) return 'gemini-2.5-pro'; // Legacy default

  return 'unknown';
}

function getStats(reports) {
  // Structure: { [model]: { [testName]: { passed, failed, total } } }
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
    // Determine branch
    const branch = 'main';

    // Get recent runs
    const cmd = `gh run list --workflow evals-nightly.yml --branch "${branch}" --limit ${
      MAX_HISTORY + 5
    } --json databaseId,createdAt,url,displayTitle,status,conclusion`;
    const runsJson = execSync(cmd, { encoding: 'utf-8' });
    let runs = JSON.parse(runsJson);

    // Filter out current run
    const currentRunId = process.env.GITHUB_RUN_ID;
    if (currentRunId) {
      runs = runs.filter((r) => r.databaseId.toString() !== currentRunId);
    }

    // Filter for runs that likely have artifacts (completed) and take top N
    // We accept 'failure' too because we want to see stats.
    runs = runs.filter((r) => r.status === 'completed').slice(0, MAX_HISTORY);

    // Fetch artifacts for each run
    for (const run of runs) {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `gemini-evals-${run.databaseId}-`),
      );
      try {
        // Download report.json files.
        // The artifacts are named 'eval-logs-X' or 'eval-logs-MODEL-X'.
        // We use -p to match pattern.
        execSync(
          `gh run download ${run.databaseId} -p "eval-logs-*" -D "${tmpDir}"`,
          { stdio: 'ignore' },
        );

        const runReports = findReports(tmpDir);
        if (runReports.length > 0) {
          history.push({
            run,
            stats: getStats(runReports), // Now returns stats grouped by model
          });
        }
      } catch (error) {
        console.error(
          `Failed to download or process artifacts for run ${run.databaseId}:`,
          error,
        );
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
  console.log('### Evals Nightly Summary\n');
  console.log(
    'See [evals/README.md](https://github.com/google-gemini/gemini-cli/tree/main/evals) for more details.\n',
  );

  // Reverse history to show oldest first
  const reversedHistory = [...history].reverse();

  const models = Object.keys(currentStatsByModel).sort();

  for (const model of models) {
    const currentStats = currentStatsByModel[model];
    const totalStats = Object.values(currentStats).reduce(
      (acc, stats) => {
        acc.passed += stats.passed;
        acc.total += stats.total;
        return acc;
      },
      { passed: 0, total: 0 },
    );

    const totalPassRate =
      totalStats.total > 0
        ? ((totalStats.passed / totalStats.total) * 100).toFixed(1) + '%'
        : 'N/A';

    console.log(`#### Model: ${model}`);
    console.log(`**Total Pass Rate: ${totalPassRate}**\n`);

    // Header
    let header = '| Test Name |';
    let separator = '| :--- |';

    for (const item of reversedHistory) {
      header += ` [${item.run.databaseId}](${item.run.url}) |`;
      separator += ' :---: |';
    }

    // Add Current column last
    header += ' Current |';
    separator += ' :---: |';

    console.log(header);
    console.log(separator);

    // Collect all test names for this model
    const allTestNames = new Set(Object.keys(currentStats));
    for (const item of reversedHistory) {
      if (item.stats[model]) {
        Object.keys(item.stats[model]).forEach((name) =>
          allTestNames.add(name),
        );
      }
    }

    for (const name of Array.from(allTestNames).sort()) {
      const searchUrl = `https://github.com/search?q=repo%3Agoogle-gemini%2Fgemini-cli%20%22${encodeURIComponent(name)}%22&type=code`;
      let row = `| [${name}](${searchUrl}) |`;

      // History
      for (const item of reversedHistory) {
        const stat = item.stats[model] ? item.stats[model][name] : null;
        if (stat) {
          const passRate = ((stat.passed / stat.total) * 100).toFixed(0) + '%';
          row += ` ${passRate} |`;
        } else {
          row += ' - |';
        }
      }

      // Current
      const curr = currentStats[name];
      if (curr) {
        const passRate = ((curr.passed / curr.total) * 100).toFixed(0) + '%';
        row += ` ${passRate} |`;
      } else {
        row += ' - |';
      }

      console.log(row);
    }
    console.log('\n');
  }
}

// --- Main ---

const currentReports = findReports(artifactsDir);
if (currentReports.length === 0) {
  console.log('No reports found.');
  // We don't exit here because we might still want to see history if available,
  // but practically if current has no reports, something is wrong.
  // Sticking to original behavior roughly, but maybe we can continue.
  process.exit(0);
}

const currentStats = getStats(currentReports);
const history = fetchHistoricalData();
generateMarkdown(currentStats, history);
