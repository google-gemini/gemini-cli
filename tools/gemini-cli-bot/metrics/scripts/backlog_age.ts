/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

try {
  // Query for the 100 oldest open issues and 100 oldest open PRs
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
        nodes {
          createdAt
        }
      }
      pullRequests(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
        nodes {
          createdAt
        }
      }
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data.repository;

  const now = Date.now();

  const calculateAges = (nodes: { createdAt: string }[]) => {
    return nodes.map((node) => (now - new Date(node.createdAt).getTime()) / (1000 * 60 * 60 * 24)); // Age in days
  };

  const issueAges = calculateAges(data.issues.nodes);
  const prAges = calculateAges(data.pullRequests.nodes);

  const getMedian = (ages: number[]) => {
    if (ages.length === 0) return 0;
    const sorted = [...ages].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const getP90 = (ages: number[]) => {
    if (ages.length === 0) return 0;
    const sorted = [...ages].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.9);
    return sorted[index];
  };

  process.stdout.write(`backlog_issue_median_age_days,${Math.round(getMedian(issueAges))}\n`);
  process.stdout.write(`backlog_issue_p90_age_days,${Math.round(getP90(issueAges))}\n`);
  process.stdout.write(`backlog_pr_median_age_days,${Math.round(getMedian(prAges))}\n`);
  process.stdout.write(`backlog_pr_p90_age_days,${Math.round(getP90(prAges))}\n`);

} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
