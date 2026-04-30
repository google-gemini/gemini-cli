/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

try {
  const query = `
  query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}, after: $cursor) {
        totalCount
        nodes {
          createdAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      issues(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}, after: $cursor) {
        totalCount
        nodes {
          createdAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  `;

  const fetchNodes = async (type: 'pullRequests' | 'issues') => {
    let allNodes: { createdAt: string }[] = [];
    let cursor: string | null = null;
    let totalCount = 0;
    
    // Fetch up to 500 items for a reasonable median calculation
    for (let i = 0; i < 5; i++) {
      const output = execSync(
        `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} ${cursor ? `-F cursor=${cursor}` : ''} -f query='${query}'`,
        { encoding: 'utf-8' },
      );
      const result = JSON.parse(output).data.repository[type];
      totalCount = result.totalCount;
      allNodes.push(...result.nodes);
      if (!result.pageInfo.hasNextPage) break;
      cursor = result.pageInfo.endCursor;
    }
    return { nodes: allNodes, totalCount };
  };

  const { nodes: prNodes, totalCount: prTotal } = await fetchNodes('pullRequests');
  const { nodes: issueNodes, totalCount: issueTotal } = await fetchNodes('issues');

  const now = new Date().getTime();

  const getMedianAgeDays = (nodes: { createdAt: string }[]) => {
    if (nodes.length === 0) return 0;
    const ages = nodes.map(
      (n) => (now - new Date(n.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    ages.sort((a, b) => a - b);
    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 !== 0
      ? ages[mid]
      : (ages[mid - 1] + ages[mid]) / 2;
  };

  const prMedianAge = getMedianAgeDays(prNodes);
  const issueMedianAge = getMedianAgeDays(issueNodes);

  process.stdout.write(
    `backlog_median_age_pr_days,${Math.round(prMedianAge * 100) / 100}\n`,
  );
  process.stdout.write(
    `backlog_median_age_issue_days,${Math.round(issueMedianAge * 100) / 100}\n`,
  );
  
  if (prTotal > prNodes.length) {
    process.stderr.write(`Warning: PR median based on oldest ${prNodes.length} of ${prTotal} items\n`);
  }
  if (issueTotal > issueNodes.length) {
    process.stderr.write(`Warning: Issue median based on oldest ${issueNodes.length} of ${issueTotal} items\n`);
  }
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
