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
          createdAt
          mergedAt
        }
      }
      issues(last: 100, states: CLOSED) {
        nodes {
          authorAssociation
          createdAt
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

  const prs = data.pullRequests.nodes.map(
    (p: {
      authorAssociation: string;
      mergedAt: string;
      createdAt: string;
    }) => ({
      association: p.authorAssociation,
      latencyHours:
        (new Date(p.mergedAt).getTime() - new Date(p.createdAt).getTime()) /
        (1000 * 60 * 60),
    }),
  );
  const issues = data.issues.nodes.map(
    (i: {
      authorAssociation: string;
      closedAt: string;
      createdAt: string;
    }) => ({
      association: i.authorAssociation,
      latencyHours:
        (new Date(i.closedAt).getTime() - new Date(i.createdAt).getTime()) /
        (1000 * 60 * 60),
    }),
  );

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);
  const calculateAvg = (
    items: { association: string; latencyHours: number }[],
  ) =>
    items.length
      ? items.reduce((a, b) => a + b.latencyHours, 0) / items.length
      : 0;

  const prMaintainers = calculateAvg(
    prs.filter((i: { association: string; latencyHours: number }) =>
      isMaintainer(i.association),
    ),
  );
  const prCommunity = calculateAvg(
    prs.filter(
      (i: { association: string; latencyHours: number }) =>
        !isMaintainer(i.association),
    ),
  );
  const prOverall = calculateAvg(prs);

  const issueMaintainers = calculateAvg(
    issues.filter((i: { association: string; latencyHours: number }) =>
      isMaintainer(i.association),
    ),
  );
  const issueCommunity = calculateAvg(
    issues.filter(
      (i: { association: string; latencyHours: number }) =>
        !isMaintainer(i.association),
    ),
  );
  const issueOverall = calculateAvg(issues);

  const timestamp = new Date().toISOString();

  const metrics: MetricOutput[] = [
    {
      metric: 'latency_pr_overall_hours',
      value: Math.round(prOverall * 100) / 100,
      timestamp,
    },
    {
      metric: 'latency_pr_maintainers_hours',
      value: Math.round(prMaintainers * 100) / 100,
      timestamp,
    },
    {
      metric: 'latency_pr_community_hours',
      value: Math.round(prCommunity * 100) / 100,
      timestamp,
    },
    {
      metric: 'latency_issue_overall_hours',
      value: Math.round(issueOverall * 100) / 100,
      timestamp,
    },
    {
      metric: 'latency_issue_maintainers_hours',
      value: Math.round(issueMaintainers * 100) / 100,
      timestamp,
    },
    {
      metric: 'latency_issue_community_hours',
      value: Math.round(issueCommunity * 100) / 100,
      timestamp,
    },
  ];

  metrics.forEach((m) => process.stdout.write(JSON.stringify(m) + '\n'));
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
