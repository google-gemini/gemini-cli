/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(states: OPEN) {
        totalCount
      }
      pullRequests(states: OPEN) {
        totalCount
      }
    }
    staleIssues: search(query: "repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue is:open label:stale OR label:Stale", type: ISSUE, first: 0) {
      issueCount
    }
    stalePRs: search(query: "repo:${GITHUB_OWNER}/${GITHUB_REPO} is:pr is:open label:stale OR label:Stale", type: ISSUE, first: 0) {
      issueCount
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const json = JSON.parse(output);
  const data = json.data;

  const totalIssues = data.repository.issues.totalCount;
  const totalPRs = data.repository.pullRequests.totalCount;
  const staleIssues = data.staleIssues.issueCount;
  const stalePRs = data.stalePRs.issueCount;

  const issueRatio = totalIssues > 0 ? staleIssues / totalIssues : 0;
  const prRatio = totalPRs > 0 ? stalePRs / totalPRs : 0;

  process.stdout.write(
    `stale_ratio_issue,${Math.round(issueRatio * 100) / 100}\n`,
  );
  process.stdout.write(`stale_ratio_pr,${Math.round(prRatio * 100) / 100}\n`);
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
