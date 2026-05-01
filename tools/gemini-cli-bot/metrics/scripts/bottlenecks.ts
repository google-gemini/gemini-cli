/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

interface IssueNode {
  number: number;
  updatedAt: string;
  comments: {
    totalCount: number;
  };
}

/**
 * Identifies "Zombie" issues (open issues with no activity for > 30 days).
 */
function run() {
  try {
    // Fetch 100 open issues, sorted by least recently updated.
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            updatedAt
            comments {
              totalCount
            }
          }
        }
      }
    }
    `;
    const output = execSync(
      `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const data = JSON.parse(output).data.repository;
    const issues: IssueNode[] = data.issues.nodes;

    if (issues.length === 0) {
      process.stdout.write('bottleneck_zombie_issues_count,0\n');
      return;
    }

    const now = new Date().getTime();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const zombies = issues.filter((issue) => {
      const updated = new Date(issue.updatedAt).getTime();
      return updated < thirtyDaysAgo;
    });

    process.stdout.write(`bottleneck_zombie_issues_count,${zombies.length}\n`);

    // Also identify "Hot" issues in the same sample (though less likely to find them in the 'oldest' sample)
    // But we can also fetch 'most recently updated' to find Hot issues.
    const hotQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(last: 100, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            updatedAt
            comments {
              totalCount
            }
          }
        }
      }
    }
    `;
    const hotOutput = execSync(
      `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${hotQuery}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const hotData = JSON.parse(hotOutput).data.repository;
    const hotIssues: IssueNode[] = hotData.issues.nodes;

    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const veryHot = hotIssues.filter((issue) => {
      const updated = new Date(issue.updatedAt).getTime();
      return updated > sevenDaysAgo && issue.comments.totalCount > 10;
    });

    process.stdout.write(`bottleneck_hot_issues_count,${veryHot.length}\n`);

  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
