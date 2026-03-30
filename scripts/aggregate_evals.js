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
const EVAL_ARTIFACT_PREFIX = 'eval-logs-';
const LONG_CONTEXT_ARTIFACT_PREFIX = 'long-context-logs-';

function findFilesByName(dir, fileName, artifactPrefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findFilesByName(fullPath, fileName, artifactPrefix));
    } else if (entry === fileName) {
      const parts = fullPath.split(path.sep);
      if (parts.some((part) => part.startsWith(artifactPrefix))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function findReports(dir) {
  return findFilesByName(dir, 'report.json', EVAL_ARTIFACT_PREFIX);
}

function findLongContextSummaries(dir) {
  return findFilesByName(dir, 'summary.json', LONG_CONTEXT_ARTIFACT_PREFIX);
}

function getModelFromPath(filePath, artifactPrefix) {
  const parts = filePath.split(path.sep);
  const artifactDir = parts.find((p) => p.startsWith(artifactPrefix));
  if (!artifactDir) return null;

  const match = artifactDir.match(new RegExp(`^${artifactPrefix}(.+)-(\\d+)$`));
  if (match) return match[1];

  return null;
}

function getStats(reports) {
  const statsByModel = {};

  for (const reportPath of reports) {
    try {
      const model = getModelFromPath(reportPath, EVAL_ARTIFACT_PREFIX);
      if (!model) continue;
      if (!statsByModel[model]) {
        statsByModel[model] = {};
      }
      const testStats = statsByModel[model];

      const content = fs.readFileSync(reportPath, 'utf-8');
      const json = JSON.parse(content);

      for (const testResult of json.testResults || []) {
        for (const assertion of testResult.assertionResults || []) {
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

function getLongContextStats(summaryPaths) {
  const statsByModel = {};

  for (const summaryPath of summaryPaths) {
    try {
      const model = getModelFromPath(summaryPath, LONG_CONTEXT_ARTIFACT_PREFIX);
      if (!model) continue;
      if (!statsByModel[model]) {
        statsByModel[model] = {
          runs: 0,
          passedTaskRuns: 0,
          totalTaskRuns: 0,
          totalTokens: 0,
          totalToolCalls: 0,
          totalCompressionCount: 0,
          totalDelegationCount: 0,
          totalFileReadCount: 0,
          totalFileWriteCount: 0,
          taskStats: {},
          failureCategoryCounts: {},
        };
      }

      const modelStats = statsByModel[model];
      const content = fs.readFileSync(summaryPath, 'utf-8');
      const json = JSON.parse(content);

      modelStats.runs += 1;
      modelStats.passedTaskRuns += json.passedTasks || 0;
      modelStats.totalTaskRuns += json.totalTasks || 0;
      modelStats.totalTokens += json.aggregatedMetrics?.totalTokens || 0;
      modelStats.totalToolCalls += json.aggregatedMetrics?.toolCallCount || 0;
      modelStats.totalCompressionCount +=
        json.aggregatedMetrics?.chatCompressionCount || 0;
      modelStats.totalDelegationCount +=
        json.aggregatedMetrics?.delegationCount || 0;
      modelStats.totalFileReadCount +=
        json.aggregatedMetrics?.fileReadCount || 0;
      modelStats.totalFileWriteCount +=
        json.aggregatedMetrics?.fileWriteCount || 0;

      for (const taskResult of json.taskResults || []) {
        const taskName = taskResult.title || taskResult.taskId;
        if (!modelStats.taskStats[taskName]) {
          modelStats.taskStats[taskName] = { passed: 0, total: 0 };
        }
        modelStats.taskStats[taskName].total += 1;
        if (taskResult.status === 'passed') {
          modelStats.taskStats[taskName].passed += 1;
        }
      }

      for (const [category, count] of Object.entries(
        json.failureCategoryCounts || {},
      )) {
        modelStats.failureCategoryCounts[category] =
          (modelStats.failureCategoryCounts[category] || 0) + count;
      }
    } catch (error) {
      console.error(
        `Error processing long-context summary at ${summaryPath}:`,
        error,
      );
    }
  }

  return statsByModel;
}

function listHistoricalRuns() {
  const branch = 'main';
  const cmd = `gh run list --workflow evals-nightly.yml --branch "${branch}" --limit ${
    MAX_HISTORY + 5
  } --json databaseId,createdAt,url,displayTitle,status,conclusion`;
  const runsJson = execSync(cmd, { encoding: 'utf-8' });
  let runs = JSON.parse(runsJson);

  const currentRunId = process.env.GITHUB_RUN_ID;
  if (currentRunId) {
    runs = runs.filter((r) => r.databaseId.toString() !== currentRunId);
  }

  return runs.filter((r) => r.status === 'completed').slice(0, MAX_HISTORY);
}

function fetchHistoricalData(artifactPrefix, fileFinder, statsParser) {
  const history = [];

  if (!process.env.GH_TOKEN) {
    return history;
  }

  try {
    const runs = listHistoricalRuns();

    for (const run of runs) {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `gemini-evals-${run.databaseId}-`),
      );
      try {
        execSync(
          `gh run download ${run.databaseId} -p "${artifactPrefix}*" -D "${tmpDir}"`,
          { stdio: 'ignore' },
        );

        const files = fileFinder(tmpDir);
        if (files.length > 0) {
          history.push({
            run,
            stats: statsParser(files),
          });
        }
      } catch {
        // Ignore runs that don't have this artifact class.
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error(
      `Failed to fetch historical data for ${artifactPrefix}:`,
      error,
    );
  }

  return history;
}

function fetchHistoricalEvalData() {
  return fetchHistoricalData(EVAL_ARTIFACT_PREFIX, findReports, getStats);
}

function fetchHistoricalLongContextData() {
  return fetchHistoricalData(
    LONG_CONTEXT_ARTIFACT_PREFIX,
    findLongContextSummaries,
    getLongContextStats,
  );
}

function getPassRate(statsForModel) {
  if (!statsForModel) return '-';
  const totalStats = Object.values(statsForModel).reduce(
    (acc, stats) => {
      acc.passed += stats.passed;
      acc.total += stats.total;
      return acc;
    },
    { passed: 0, total: 0 },
  );
  return totalStats.total > 0
    ? ((totalStats.passed / totalStats.total) * 100).toFixed(1) + '%'
    : '-';
}

function getLongContextPassRate(statsForModel) {
  if (!statsForModel || !statsForModel.totalTaskRuns) return '-';
  return (
    (
      (statsForModel.passedTaskRuns / statsForModel.totalTaskRuns) *
      100
    ).toFixed(1) + '%'
  );
}

function formatAverage(total, runs) {
  if (!runs) return '-';
  return (total / runs).toFixed(1);
}

function formatFailureCounts(counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '-';
  return entries.map(([name, count]) => `${name} (${count})`).join(', ');
}

function generateEvalMarkdown(currentStatsByModel, history) {
  const models = Object.keys(currentStatsByModel).sort();
  if (models.length === 0) {
    return;
  }

  console.log('### Evals Nightly Summary\n');
  console.log(
    'See [evals/README.md](https://github.com/google-gemini/gemini-cli/tree/main/evals) for more details.\n',
  );

  const reversedHistory = [...history].reverse();

  for (const model of models) {
    const currentStats = currentStatsByModel[model];
    const totalPassRate = getPassRate(currentStats);

    console.log(`#### Model: ${model}`);
    console.log(`**Total Pass Rate: ${totalPassRate}**\n`);

    let header = '| Test Name |';
    let separator = '| :--- |';
    let passRateRow = '| **Overall Pass Rate** |';

    for (const item of reversedHistory) {
      header += ` [${item.run.databaseId}](${item.run.url}) |`;
      separator += ' :---: |';
      passRateRow += ` **${getPassRate(item.stats[model])}** |`;
    }

    header += ' Current |';
    separator += ' :---: |';
    passRateRow += ` **${totalPassRate}** |`;

    console.log(header);
    console.log(separator);
    console.log(passRateRow);

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

      for (const item of reversedHistory) {
        const stat = item.stats[model] ? item.stats[model][name] : null;
        if (stat) {
          const passRate = ((stat.passed / stat.total) * 100).toFixed(0) + '%';
          row += ` ${passRate} |`;
        } else {
          row += ' - |';
        }
      }

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

function generateLongContextMarkdown(currentStatsByModel, history) {
  const models = Object.keys(currentStatsByModel).sort();
  if (models.length === 0) {
    return;
  }

  console.log('### Long-context Eval Summary\n');
  console.log(
    'Repository-scale results from `evals/long-context`, including executable oracles and process metrics.\n',
  );

  const reversedHistory = [...history].reverse();

  let header = '| Model |';
  let separator = '| :--- |';
  for (const item of reversedHistory) {
    header += ` [${item.run.databaseId}](${item.run.url}) |`;
    separator += ' :---: |';
  }
  header += ' Current |';
  separator += ' :---: |';

  console.log(header);
  console.log(separator);

  for (const model of models) {
    let row = `| ${model} |`;
    for (const item of reversedHistory) {
      row += ` ${getLongContextPassRate(item.stats[model])} |`;
    }
    row += ` ${getLongContextPassRate(currentStatsByModel[model])} |`;
    console.log(row);
  }
  console.log('');

  console.log(
    '| Model | Runs | Task pass rate | Avg tokens/run | Avg tool calls/run | Avg compression/run | Avg delegations/run | Avg file reads/run | Avg file writes/run | Failure categories |',
  );
  console.log(
    '| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |',
  );

  for (const model of models) {
    const stats = currentStatsByModel[model];
    console.log(
      `| ${model} | ${stats.runs} | ${getLongContextPassRate(stats)} | ${formatAverage(
        stats.totalTokens,
        stats.runs,
      )} | ${formatAverage(stats.totalToolCalls, stats.runs)} | ${formatAverage(
        stats.totalCompressionCount,
        stats.runs,
      )} | ${formatAverage(stats.totalDelegationCount, stats.runs)} | ${formatAverage(
        stats.totalFileReadCount,
        stats.runs,
      )} | ${formatAverage(stats.totalFileWriteCount, stats.runs)} | ${formatFailureCounts(
        stats.failureCategoryCounts,
      )} |`,
    );
  }
  console.log('');

  for (const model of models) {
    const stats = currentStatsByModel[model];
    const taskNames = Object.keys(stats.taskStats).sort();
    if (taskNames.length === 0) continue;

    console.log(`#### Long-context tasks — ${model}\n`);
    console.log('| Task | Pass Rate |');
    console.log('| :--- | ---: |');
    for (const taskName of taskNames) {
      const taskStats = stats.taskStats[taskName];
      const passRate =
        taskStats.total > 0
          ? ((taskStats.passed / taskStats.total) * 100).toFixed(0) + '%'
          : '-';
      console.log(`| ${taskName} | ${passRate} |`);
    }
    console.log('');
  }
}

const currentReports = findReports(artifactsDir);
const currentLongContextSummaries = findLongContextSummaries(artifactsDir);

if (currentReports.length === 0 && currentLongContextSummaries.length === 0) {
  console.log('No reports found.');
  process.exit(0);
}

const currentStats = getStats(currentReports);
const currentLongContextStats = getLongContextStats(
  currentLongContextSummaries,
);
const history = fetchHistoricalEvalData();
const longContextHistory = fetchHistoricalLongContextData();

generateEvalMarkdown(currentStats, history);
generateLongContextMarkdown(currentLongContextStats, longContextHistory);
