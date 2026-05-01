/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

/**
 * Checks if the author association belongs to a maintainer.
 */
const isMaintainer = (assoc: string) =>
  ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

interface Item {
  association: string;
  date: number;
}

/**
 * Calculates items per day over the sample period.
 */
const calculateThroughput = (items: Item[]) => {
  if (items.length < 2) return 0;
  const first = items[0].date;
  const last = items[items.length - 1].date;
  const days = (last - first) / (1000 * 60 * 60 * 24);
  return days > 0 ? items.length / days : items.length;
};

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(last: 100, states: MERGED) {
        nodes {
          authorAssociation
          mergedAt
        }
      }
      issues(last: 100, states: CLOSED) {
        nodes {
          authorAssociation
          closedAt
        }
      }
      arrival: issues(last: 100) {
        nodes {
          createdAt
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

  const prs: Item[] = data.pullRequests.nodes
    .map((p: { authorAssociation: string; mergedAt: string }) => ({
      association: p.authorAssociation,
      date: new Date(p.mergedAt).getTime(),
    }))
    .sort((a: Item, b: Item) => a.date - b.date);

  const issues: Item[] = data.issues.nodes
    .map((i: { authorAssociation: string; closedAt: string }) => ({
      association: i.authorAssociation,
      date: new Date(i.closedAt).getTime(),
    }))
    .sort((a: Item, b: Item) => a.date - b.date);

  const arrivalDates = data.arrival.nodes
    .map((i: { createdAt: string }) => new Date(i.createdAt).getTime())
    .sort((a: number, b: number) => a - b);

  const calculateArrivalRate = (dates: number[]) => {
    if (dates.length < 2) return 0;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const days = (last - first) / (1000 * 60 * 60 * 24);
    return days > 0 ? dates.length / days : dates.length;
  };

  const prOverall = calculateThroughput(prs);
  const prMaintainers = calculateThroughput(
    prs.filter((i) => isMaintainer(i.association)),
  );
  const prCommunity = calculateThroughput(
    prs.filter((i) => !isMaintainer(i.association)),
  );

  const issueOverall = calculateThroughput(issues);
  const issueMaintainers = calculateThroughput(
    issues.filter((i) => isMaintainer(i.association)),
  );
  const issueCommunity = calculateThroughput(
    issues.filter((i) => !isMaintainer(i.association)),
  );

  const arrivalRate = calculateArrivalRate(arrivalDates);

  process.stdout.write(
    `throughput_pr_overall_per_day,${Math.round(prOverall * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_pr_maintainers_per_day,${Math.round(prMaintainers * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_pr_community_per_day,${Math.round(prCommunity * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_overall_per_day,${Math.round(issueOverall * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_maintainers_per_day,${Math.round(issueMaintainers * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_community_per_day,${Math.round(issueCommunity * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_arrival_rate_per_day,${Math.round(arrivalRate * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_overall_days_per_issue,${issueOverall > 0 ? Math.round((1 / issueOverall) * 100) / 100 : 0}\n`,
  );
  process.stdout.write(
    `throughput_issue_maintainers_days_per_issue,${issueMaintainers > 0 ? Math.round((1 / issueMaintainers) * 100) / 100 : 0}\n`,
  );
  process.stdout.write(
    `throughput_issue_community_days_per_issue,${issueCommunity > 0 ? Math.round((1 / issueCommunity) * 100) / 100 : 0}\n`,
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
