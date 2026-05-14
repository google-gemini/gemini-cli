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
  query($prQuery: String!, $issueQuery: String!) {
    prSearch: search(query: $prQuery, type: ISSUE, first: 1000) {
      nodes {
        ... on PullRequest {
          authorAssociation
          comments { totalCount }
          reviews { totalCount }
        }
      }
    }
    issueSearch: search(query: $issueQuery, type: ISSUE, first: 1000) {
      nodes {
        ... on Issue {
          authorAssociation
          comments { totalCount }
        }
      }
    }
  }
  `;

  const prQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:pr updated:>=${dateStr}`;
  const issueQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue updated:>=${dateStr}`;

  const output = execSync(
    `gh api graphql -F prQuery='${prQuery}' -F issueQuery='${issueQuery}' -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data;
  if (!data) {
    throw new Error('No data returned from GraphQL API');
  }

  const prs = data.prSearch?.nodes || [];
  const issues = data.issueSearch?.nodes || [];

  const allItems = [
    ...prs.map(
      (p: {
        authorAssociation: string;
        comments: { totalCount: number };
        reviews?: { totalCount: number };
      }) => ({
        association: p.authorAssociation,
        touches: p.comments.totalCount + (p.reviews ? p.reviews.totalCount : 0),
      }),
    ),
    ...issues.map(
      (i: { authorAssociation: string; comments: { totalCount: number } }) => ({
        association: i.authorAssociation,
        touches: i.comments.totalCount,
      }),
    ),
  ];

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

  const calculateAvg = (items: { touches: number; association: string }[]) =>
    items.length ? items.reduce((a, b) => a + b.touches, 0) / items.length : 0;

  const overall = calculateAvg(allItems);
  const maintainers = calculateAvg(
    allItems.filter((i) => isMaintainer(i.association)),
  );
  const community = calculateAvg(
    allItems.filter((i) => !isMaintainer(i.association)),
  );

  process.stdout.write(
    `user_touches_overall,${Math.round(overall * 100) / 100}\n`,
  );
  process.stdout.write(
    `user_touches_maintainers,${Math.round(maintainers * 100) / 100}\n`,
  );
  process.stdout.write(
    `user_touches_community,${Math.round(community * 100) / 100}\n`,
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
