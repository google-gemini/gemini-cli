#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

const BRANCH =
  process.argv[2] || execSync('git branch --show-current').toString().trim();
const RUN_ID_OVERRIDE = process.argv[3];

let REPO;
try {
  const remoteUrl = execSync('git remote get-url origin').toString().trim();
  REPO = remoteUrl
    .replace(/.*github\.com[\/:]/, '')
    .replace(/\.git$/, '')
    .trim();
} catch (e) {
  REPO = 'google-gemini/gemini-cli';
}

const FAILED_FILES = new Set();

function runGh(args) {
  try {
    return execSync(`gh ${args}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch (e) {
    return null;
  }
}

function fetchFailuresViaApi(jobId) {
  try {
    const cmd = `gh api repos/${REPO}/actions/jobs/${jobId}/logs | grep -iE " FAIL |❌|ERROR|Lint failed|Build failed|Exception|failed with exit code"`;
    return execSync(cmd, {
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch (e) {
    return '';
  }
}

function isNoise(line) {
  const lower = line.toLowerCase();
  return (
    lower.includes('* [new branch]') ||
    lower.includes('npm warn') ||
    lower.includes('fetching updates') ||
    lower.includes('node:internal/errors') ||
    lower.includes('at ') || // Stack traces
    lower.includes('checkexecsyncerror') ||
    lower.includes('node_modules')
  );
}

function extractTestFile(failureText) {
  const cleanLine = failureText
    .replace(/[|#\[\]()]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim();
  const fileMatch = cleanLine.match(/([\w\/._-]+\.test\.[jt]sx?)/);
  if (fileMatch) return fileMatch[1];
  return null;
}

function generateTestCommand(failedFilesMap) {
  const workspaceToFiles = new Map();
  for (const [file, info] of failedFilesMap.entries()) {
    if (
      ['Job Error', 'Unknown File', 'Build Error', 'Lint Error'].includes(file)
    )
      continue;
    let workspace = '@google/gemini-cli';
    let relPath = file;
    if (file.startsWith('packages/core/')) {
      workspace = '@google/gemini-cli-core';
      relPath = file.replace('packages/core/', '');
    } else if (file.startsWith('packages/cli/')) {
      workspace = '@google/gemini-cli';
      relPath = file.replace('packages/cli/', '');
    }
    relPath = relPath.replace(/^.*packages\/[^\/]+\//, '');
    if (!workspaceToFiles.has(workspace))
      workspaceToFiles.set(workspace, new Set());
    workspaceToFiles.get(workspace).add(relPath);
  }
  const commands = [];
  for (const [workspace, files] of workspaceToFiles.entries()) {
    commands.push(`npm test -w ${workspace} -- ${Array.from(files).join(' ')}`);
  }
  return commands.join(' && ');
}

async function monitor() {
  let targetRunIds = [];
  if (RUN_ID_OVERRIDE) {
    targetRunIds = [RUN_ID_OVERRIDE];
  } else {
    // 1. Get runs directly associated with the branch
    const runListOutput = runGh(
      `run list --branch "${BRANCH}" --limit 10 --json databaseId,status,workflowName,createdAt`,
    );
    if (runListOutput) {
      const runs = JSON.parse(runListOutput);
      const activeRuns = runs.filter((r) => r.status !== 'completed');
      if (activeRuns.length > 0) {
        targetRunIds = activeRuns.map((r) => r.databaseId);
      } else if (runs.length > 0) {
        const latestTime = new Date(runs[0].createdAt).getTime();
        targetRunIds = runs
          .filter((r) => latestTime - new Date(r.createdAt).getTime() < 60000)
          .map((r) => r.databaseId);
      }
    }

    // 2. Get runs associated with commit statuses (handles chained/indirect runs)
    try {
      const headSha = execSync(`git rev-parse "${BRANCH}"`).toString().trim();
      const statusOutput = runGh(
        `api repos/${REPO}/commits/${headSha}/status -q '.statuses[] | select(.target_url | contains("actions/runs/")) | .target_url'`,
      );
      if (statusOutput) {
        const statusRunIds = statusOutput
          .split('\n')
          .filter(Boolean)
          .map((url) => {
            const match = url.match(/actions\/runs\/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
          })
          .filter(Boolean);

        for (const runId of statusRunIds) {
          if (!targetRunIds.includes(runId)) {
            targetRunIds.push(runId);
          }
        }
      }
    } catch (e) {
      // Ignore if branch/SHA not found or API fails
    }

    if (targetRunIds.length > 0) {
      const runNames = [];
      for (const runId of targetRunIds) {
        const runInfo = runGh(`run view "${runId}" --json workflowName`);
        if (runInfo) {
          runNames.push(JSON.parse(runInfo).workflowName);
        }
      }
      console.log(`Monitoring workflows: ${[...new Set(runNames)].join(', ')}`);
    }
  }

  if (targetRunIds.length === 0) {
    console.log(`No runs found for branch ${BRANCH}.`);
    process.exit(0);
  }

  while (true) {
    let allPassed = 0,
      allFailed = 0,
      allRunning = 0,
      allQueued = 0,
      totalJobs = 0;
    let anyRunInProgress = false;
    const fileToTests = new Map();
    let failuresFoundInLoop = false;

    for (const runId of targetRunIds) {
      const runOutput = runGh(
        `run view "${runId}" --json databaseId,status,conclusion,workflowName`,
      );
      if (!runOutput) continue;
      const run = JSON.parse(runOutput);
      if (run.status !== 'completed') anyRunInProgress = true;

      const jobsOutput = runGh(`run view "${runId}" --json jobs`);
      if (jobsOutput) {
        const { jobs } = JSON.parse(jobsOutput);
        totalJobs += jobs.length;
        const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
        if (failedJobs.length > 0) {
          failuresFoundInLoop = true;
          for (const job of failedJobs) {
            const failures = fetchFailuresViaApi(job.databaseId);
            if (failures.trim()) {
              failures.split('\n').forEach((line) => {
                if (!line.trim() || isNoise(line)) return;
                const file = extractTestFile(line);
                const filePath =
                  file ||
                  (line.toLowerCase().includes('lint')
                    ? 'Lint Error'
                    : line.toLowerCase().includes('build')
                      ? 'Build Error'
                      : 'Unknown File');
                let testName = line;
                if (line.includes(' > ')) {
                  testName = line.split(' > ').slice(1).join(' > ').trim();
                }
                if (!fileToTests.has(filePath))
                  fileToTests.set(filePath, new Set());
                fileToTests.get(filePath).add(testName);
              });
            } else {
              const step =
                job.steps?.find((s) => s.conclusion === 'failure')?.name ||
                'unknown';
              const category = step.toLowerCase().includes('lint')
                ? 'Lint Error'
                : step.toLowerCase().includes('build')
                  ? 'Build Error'
                  : 'Job Error';
              if (!fileToTests.has(category))
                fileToTests.set(category, new Set());
              fileToTests
                .get(category)
                .add(`${job.name}: Failed at step "${step}"`);
            }
          }
        }
        for (const job of jobs) {
          if (job.status === 'in_progress') allRunning++;
          else if (job.status === 'queued') allQueued++;
          else if (job.conclusion === 'success') allPassed++;
          else if (job.conclusion === 'failure') allFailed++;
        }
      }
    }

    if (failuresFoundInLoop) {
      console.log(
        `\n\n❌ Failures detected across ${allFailed} job(s). Stopping monitor...`,
      );
      console.log('\n--- Structured Failure Report (Noise Filtered) ---');
      for (const [file, tests] of fileToTests.entries()) {
        console.log(`\nCategory/File: ${file}`);
        // Limit output per file if it's too large
        const testsArr = Array.from(tests).map((t) =>
          t.length > 500 ? t.substring(0, 500) + '... [TRUNCATED]' : t,
        );
        testsArr.slice(0, 10).forEach((t) => console.log(`  - ${t}`));
        if (testsArr.length > 10)
          console.log(`  ... and ${testsArr.length - 10} more`);
      }
      const testCmd = generateTestCommand(fileToTests);
      if (testCmd) {
        console.log('\n🚀 Run this to verify fixes:');
        console.log(testCmd);
      } else if (
        Array.from(fileToTests.keys()).some((k) => k.includes('Lint'))
      ) {
        console.log('\n🚀 Run this to verify lint fixes:\nnpm run lint:all');
      }
      console.log('---------------------------------');
      process.exit(1);
    }

    const completed = allPassed + allFailed;
    process.stdout.write(
      `\r⏳ Monitoring ${targetRunIds.length} runs... ${completed}/${totalJobs} jobs (${allPassed} passed, ${allFailed} failed, ${allRunning} running, ${allQueued} queued)          `,
    );
    if (!anyRunInProgress) {
      console.log('\n✅ All workflows passed!');
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
}

monitor().catch((err) => {
  console.error('\nMonitor error:', err.message);
  process.exit(1);
});
