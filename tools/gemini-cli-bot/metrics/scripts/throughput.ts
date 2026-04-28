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
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data.repository;

  const prs = data.pullRequests.nodes
    .map((p: { authorAssociation: string; mergedAt: string }) => ({
      association: p.authorAssociation,
      date: new Date(p.mergedAt).getTime(),
    }))
    .sort((a: { date: number }, b: { date: number }) => a.date - b.date);

  const issues = data.issues.nodes
    .map((i: { authorAssociation: string; closedAt: string }) => ({
      association: i.authorAssociation,
      date: new Date(i.closedAt).getTime(),
    }))
    .sort((a: { date: number }, b: { date: number }) => a.date - b.date);

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

  const calculateThroughput = (
    items: { association: string; date: number }[],
  ) => {
    if (items.length < 2) return 0;
    const first = items[0].date;
    const last = items[items.length - 1].date;
    const days = (last - first) / (1000 * 60 * 60 * 24);
    return days > 0 ? items.length / days : items.length; // items per day
  };

  const prOverall = calculateThroughput(prs);
  const prMaintainers = calculateThroughput(
    prs.filter((i: { association: string; date: number }) =>
      isMaintainer(i.association),
    ),
  );
  const prCommunity = calculateThroughput(
    prs.filter(
      (i: { association: string; date: number }) =>
        !isMaintainer(i.association),
    ),
  );

  const issueOverall = calculateThroughput(issues);
  const issueMaintainers = calculateThroughput(
    issues.filter((i: { association: string; date: number }) =>
      isMaintainer(i.association),
    ),
  );
  const issueCommunity = calculateThroughput(
    issues.filter(
      (i: { association: string; date: number }) =>
        !isMaintainer(i.association),
    ),
  );

  const timestamp = new Date().toISOString();

  const metrics: MetricOutput[] = [
    {
      metric: 'throughput_pr_overall_per_day',
      value: Math.round(prOverall * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_pr_maintainers_per_day',
      value: Math.round(prMaintainers * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_pr_community_per_day',
      value: Math.round(prCommunity * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_issue_overall_per_day',
      value: Math.round(issueOverall * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_issue_maintainers_per_day',
      value: Math.round(issueMaintainers * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_issue_community_per_day',
      value: Math.round(issueCommunity * 100) / 100,
      timestamp,
    },
    {
      metric: 'throughput_issue_overall_days_per_issue',
      value: issueOverall > 0 ? Math.round((1 / issueOverall) * 100) / 100 : 0,
      timestamp,
    },
    {
      metric: 'throughput_issue_maintainers_days_per_issue',
      value:
        issueMaintainers > 0
          ? Math.round((1 / issueMaintainers) * 100) / 100
          : 0,
      timestamp,
    },
    {
      metric: 'throughput_issue_community_days_per_issue',
      value:
        issueCommunity > 0 ? Math.round((1 / issueCommunity) * 100) / 100 : 0,
      timestamp,
    },
  ];

  metrics.forEach((m) => process.stdout.write(JSON.stringify(m) + '\n'));
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
