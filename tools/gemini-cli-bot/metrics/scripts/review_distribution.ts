/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

try {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];

  const query = `
  query($prQuery: String!) {
    prSearch: search(query: $prQuery, type: ISSUE, first: 1000) {
      nodes {
        ... on PullRequest {
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
  const prQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:pr updated:>=${dateStr}`;

  const output = execSync(
    `gh api graphql -F prQuery='${prQuery}' -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data;
  if (!data) {
    throw new Error('No data returned from GraphQL API');
  }

  const reviewCounts: Record<string, number> = {};

  const nodes = data.prSearch?.nodes || [];
  for (const pr of nodes) {
    if (!pr?.reviews?.nodes) continue;
    // We only count one review per author per PR to avoid counting multiple review comments as multiple reviews
    const reviewersOnPR = new Set<string>();

    for (const review of pr.reviews.nodes) {
      if (
        ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(
          review.authorAssociation,
        ) &&
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

  process.stdout.write(
    `review_distribution_variance,${Math.round(variance * 100) / 100}\n`,
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
