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
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(last: 100) {
        nodes {
          authorAssociation
          author { login }
          createdAt
          comments(first: 20) {
            nodes {
              author { login }
              createdAt
            }
          }
          reviews(first: 20) {
            nodes {
              author { login }
              createdAt
            }
          }
        }
      }
      issues(last: 100) {
        nodes {
          authorAssociation
          author { login }
          createdAt
          comments(first: 20) {
            nodes {
              author { login }
              createdAt
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

  const getFirstResponseTime = (item: {
    createdAt: string;
    author: { login: string };
    comments: { nodes: { createdAt: string; author?: { login: string } }[] };
    reviews?: { nodes: { createdAt: string; author?: { login: string } }[] };
  }) => {
    const authorLogin = item.author?.login;
    let earliestResponse: number | null = null;

    const checkNodes = (
      nodes: { createdAt: string; author?: { login: string } }[],
    ) => {
      for (const node of nodes) {
        if (node.author?.login && node.author.login !== authorLogin) {
          const login = node.author.login.toLowerCase();
          if (login.endsWith('[bot]') || login.includes('bot')) {
            continue; // Ignore bots
          }
          const time = new Date(node.createdAt).getTime();
          if (!earliestResponse || time < earliestResponse) {
            earliestResponse = time;
          }
        }
      }
    };

    if (item.comments?.nodes) checkNodes(item.comments.nodes);
    if (item.reviews?.nodes) checkNodes(item.reviews.nodes);

    if (earliestResponse) {
      return (
        (earliestResponse - new Date(item.createdAt).getTime()) /
        (1000 * 60 * 60)
      );
    }
    return null; // No response yet
  };
  const processItems = (
    items: {
      authorAssociation: string;
      createdAt: string;
      author: { login: string };
      comments: {
        nodes: { createdAt: string; author?: { login: string } }[];
      };
      reviews?: {
        nodes: { createdAt: string; author?: { login: string } }[];
      };
    }[],
  ) => {
    return items
      .map((item) => ({
        association: item.authorAssociation,
        ttfr: getFirstResponseTime(item),
      }))
      .filter((i) => i.ttfr !== null) as {
      association: string;
      ttfr: number;
    }[];
  };
  const prs = processItems(data.pullRequests.nodes);
  const issues = processItems(data.issues.nodes);
  const allItems = [...prs, ...issues];

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

  const calculateAvg = (items: { ttfr: number; association: string }[]) =>
    items.length ? items.reduce((a, b) => a + b.ttfr, 0) / items.length : 0;

  const maintainers = calculateAvg(
    allItems.filter((i) => isMaintainer(i.association)),
  );
  const overall = calculateAvg(allItems);

  process.stdout.write(
    `time_to_first_response_overall_hours,${Math.round(overall * 100) / 100}\n`,
  );
  process.stdout.write(
    `time_to_first_response_maintainers_hours,${Math.round(maintainers * 100) / 100}\n`,
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
