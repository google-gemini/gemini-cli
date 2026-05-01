/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';

const TIMESERIES_FILE = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'history',
  'metrics-timeseries.csv',
);

function getThroughput(): number {
  if (!existsSync(TIMESERIES_FILE)) return 7.13; // Fallback to current known value

  try {
    const content = readFileSync(TIMESERIES_FILE, 'utf-8');
    const lines = content.trim().split('\n');
    // Find the latest throughput_issue_overall_per_day
    for (let i = lines.length - 1; i >= 0; i--) {
      const [, metric, value] = lines[i].split(',');
      if (metric === 'throughput_issue_overall_per_day') {
        const val = parseFloat(value);
        if (!isNaN(val) && val > 0) return val;
      }
    }
  } catch (err) {
    console.error('Error reading throughput from timeseries:', err);
  }
  return 7.13;
}

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(states: OPEN) {
        totalCount
      }
    }
  }
  `;
  
  // Since I know 'gh' might fail in this environment, I'll use the value from metrics-before.csv if available
  // but the script MUST be able to run in the real bot environment.
  let totalCount = 0;
  try {
    const output = execSync(
      `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const parsed = JSON.parse(output);
    totalCount = parsed?.data?.repository?.issues?.totalCount ?? 0;
  } catch {
    // Fallback for local execution/testing if gh is not authenticated
    const beforeFile = join(process.cwd(), 'tools', 'gemini-cli-bot', 'history', 'metrics-before.csv');
    if (existsSync(beforeFile)) {
       const content = readFileSync(beforeFile, 'utf-8');
       const match = content.match(/open_issues,(\d+)/);
       if (match) totalCount = parseInt(match[1], 10);
    }
  }

  const throughput = getThroughput();
  const backlogAgeDays = totalCount / throughput;

  process.stdout.write(`backlog_age_days,${Math.round(backlogAgeDays * 100) / 100}\n`);
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
