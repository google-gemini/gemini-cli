/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

interface HotIssueNode {
  number: number;
  comments: {
    totalCount: number;
  };
}

/**
 * Identifies "Zombie" issues (open issues with no activity for > 30 days).
 */
function run() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Count Zombie issues using Search API totalCount (unlimited)
    const zombieSearchQuery = `is:issue is:open repo:${GITHUB_OWNER}/${GITHUB_REPO} updated:<${thirtyDaysAgo.toISOString()}`;
    const zombieQuery = `
    query($searchQuery: String!) {
      search(query: $searchQuery, type: ISSUE, first: 0) {
        issueCount
      }
    }
    `;
    const zombieOutput = execSync(
      `gh api graphql -F searchQuery='${zombieSearchQuery}' -f query='${zombieQuery}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const zombieCount = JSON.parse(zombieOutput).data.search.issueCount;
    process.stdout.write(`bottleneck_zombie_issues_count,${zombieCount}\n`);

    // 2. Identify "Hot" issues. Since we need to count comments per issue, 
    // we still need to fetch some nodes, but we can target the most active ones.
    const hotSearchQuery = `is:issue is:open repo:${GITHUB_OWNER}/${GITHUB_REPO} updated:>${sevenDaysAgo.toISOString()} sort:comments-desc`;
    const hotQuery = `
    query($searchQuery: String!) {
      search(query: $searchQuery, type: ISSUE, first: 100) {
        nodes {
          ... on Issue {
            number
            comments {
              totalCount
            }
          }
        }
      }
    }
    `;
    const hotOutput = execSync(
      `gh api graphql -F searchQuery='${hotSearchQuery}' -f query='${hotQuery}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const hotNodes = JSON.parse(hotOutput).data.search.nodes as HotIssueNode[];
    
    // We define "Hot" as > 10 comments in the last 7 days.
    // Note: Search query 'sort:comments-desc' gets those with most total comments,
    // which is a good proxy for 'Hot' when filtered by recent updates.
    const veryHot = hotNodes.filter((node) => node.comments.totalCount > 10);
    process.stdout.write(`bottleneck_hot_issues_count,${veryHot.length}\n`);

  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
