/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { GITHUB_OWNER, GITHUB_REPO, type MetricOutput } from '../types.js';

try {
  const repo = process.env.GITHUB_REPOSITORY || `${GITHUB_OWNER}/${GITHUB_REPO}`;
  const count = execSync(
    `gh api "search/issues?q=repo:${repo}+is:issue+is:open" --jq .total_count`,
    {
      encoding: 'utf-8',
    },
  ).trim();

  const metric: MetricOutput = {
    metric: 'open_issues',
    value: parseInt(count, 10) || 0,
    timestamp: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(metric) + '\n');
} catch (err) {
  process.stderr.write(`Error fetching open issues: ${err instanceof Error ? err.message : String(err)}\n`);
  const fallback: MetricOutput = {
    metric: 'open_issues',
    value: 0,
    timestamp: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(fallback) + '\n');
}
