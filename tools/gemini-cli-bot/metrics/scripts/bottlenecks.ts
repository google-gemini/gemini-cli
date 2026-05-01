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
      pullRequests(states: OPEN, last: 50) {
        nodes {
          author { login }
          timelineItems(last: 10, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_REVIEW_COMMENT]) {
            nodes {
              ... on IssueComment { author { login } createdAt }
              ... on PullRequestReview { author { login } createdAt }
              ... on PullRequestReviewComment { author { login } createdAt }
            }
          }
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
  const prs = data.pullRequests.nodes;

  let waitingOnMaintainer = 0;
  let waitingOnAuthor = 0;

  for (const pr of prs) {
    const author = pr.author?.login;
    if (!author) continue;

    const items = pr.timelineItems.nodes as {
      author: { login: string };
      createdAt: string;
    }[];
    if (items.length === 0) {
      waitingOnMaintainer++;
      continue;
    }

    // Sort by createdAt just in case
    items.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const lastItem = items[items.length - 1];
    const lastActor = lastItem.author?.login;

    if (lastActor === author) {
      waitingOnMaintainer++;
    } else {
      waitingOnAuthor++;
    }
  }

  process.stdout.write(
    `prs_waiting_on_maintainer_sample,${waitingOnMaintainer}\n`,
  );
  process.stdout.write(`prs_waiting_on_author_sample,${waitingOnAuthor}\n`);
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
