/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}) {
        totalCount
        nodes {
          createdAt
        }
      }
      pullRequests(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}) {
        totalCount
        nodes {
          createdAt
        }
      }
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
  const parsed = JSON.parse(output);
  const data = parsed?.data?.repository;

  if (data?.issues?.totalCount > 100) {
    process.stderr.write(`Warning: Backlog has ${data.issues.totalCount} issues, but only the oldest 100 were used for median calculation.\n`);
  }
  if (data?.pullRequests?.totalCount > 100) {
    process.stderr.write(`Warning: Backlog has ${data.pullRequests.totalCount} PRs, but only the oldest 100 were used for median calculation.\n`);
  }

  const calculateMedianAgeDays = (nodes: { createdAt: string }[]) => {
    if (!nodes || nodes.length === 0) return 0;
    const now = Date.now();
    const ages = nodes.map(
      (n) => (now - new Date(n.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    ages.sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 !== 0
      ? ages[mid]
      : (ages[mid - 1] + ages[mid]) / 2;
  };

  const issueAge = calculateMedianAgeDays(data?.issues?.nodes ?? []);
  const prAge = calculateMedianAgeDays(data?.pullRequests?.nodes ?? []);

  process.stdout.write(`backlog_age_issue_median_days,${Math.round(issueAge * 100) / 100}\n`);
  process.stdout.write(`backlog_age_pr_median_days,${Math.round(prAge * 100) / 100}\n`);
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
