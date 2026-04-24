/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

import { GITHUB_OWNER, GITHUB_REPO, MetricOutput } from '../types.js';
import { execSync } from 'node:child_process';

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(last: 100) {
        nodes {
          reviews(first: 50) {
            nodes {
              author { login }
              authorAssociation
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

  const reviewCounts: Record<string, number> = {};

  for (const pr of data.pullRequests.nodes) {
    if (!pr.reviews?.nodes) continue;
    // We only count one review per author per PR to avoid counting multiple review comments as multiple reviews
    const reviewersOnPR = new Set<string>();

    for (const review of pr.reviews.nodes) {
      if (
        ['MEMBER', 'OWNER'].includes(review.authorAssociation) &&
        review.author?.login
      ) {
        const login = review.author.login.toLowerCase();
        if (login.endsWith('[bot]') || login.includes('bot')) {
          continue; // Ignore bots
        }
        reviewersOnPR.add(review.author.login);
      }
    }

    for (const reviewer of reviewersOnPR) {
      reviewCounts[reviewer] = (reviewCounts[reviewer] || 0) + 1;
    }
  }

  const counts = Object.values(reviewCounts);

  let variance = 0;
  if (counts.length > 0) {
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    variance =
      counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
  }

  const timestamp = new Date().toISOString();

  process.stdout.write(
    JSON.stringify(<MetricOutput>{
      metric: 'review_distribution_variance',
      value: Math.round(variance * 100) / 100,
      timestamp,
      details: reviewCounts,
    }) + '\n',
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
