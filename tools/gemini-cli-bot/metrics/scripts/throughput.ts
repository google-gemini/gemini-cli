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
      pullRequests(last: 100, states: MERGED) {
        nodes {
          authorAssociation
          mergedAt
          mergedBy { login }
        }
      }
      issues(last: 100, states: CLOSED) {
        nodes {
          authorAssociation
          closedAt
          closedBy {
            ... on User { login }
            ... on Bot { login }
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

  const prs = data.pullRequests.nodes
    .map(
      (p: {
        authorAssociation: string;
        mergedAt: string;
        mergedBy: { login: string };
      }) => ({
        association: p.authorAssociation,
        date: new Date(p.mergedAt).getTime(),
        mergedBy: p.mergedBy?.login,
      }),
    )
    .sort((a: { date: number }, b: { date: number }) => a.date - b.date);

  const issues = data.issues.nodes
    .map(
      (i: {
        authorAssociation: string;
        closedAt: string;
        closedBy: { login: string };
      }) => ({
        association: i.authorAssociation,
        date: new Date(i.closedAt).getTime(),
        closedBy: i.closedBy?.login,
      }),
    )
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
  const prMaintainerAuthored = calculateThroughput(
    prs.filter((i: { association: string; date: number }) =>
      isMaintainer(i.association),
    ),
  );
  const prCommunityAuthored = calculateThroughput(
    prs.filter(
      (i: { association: string; date: number }) =>
        !isMaintainer(i.association),
    ),
  );

  const issueOverall = calculateThroughput(issues);
  const issueMaintainerAuthored = calculateThroughput(
    issues.filter((i: { association: string; date: number }) =>
      isMaintainer(i.association),
    ),
  );
  const issueCommunityAuthored = calculateThroughput(
    issues.filter(
      (i: { association: string; date: number }) =>
        !isMaintainer(i.association),
    ),
  );

  const prMaintainerMerges = calculateThroughput(
    prs.filter((i: { mergedBy: string }) => {
      // This is a bit of a hack since we don't have the list of maintainers here,
      // but we can assume if they merged it, they are likely a maintainer
      // or at least have merge permissions.
      return i.mergedBy && !i.mergedBy.toLowerCase().includes('bot');
    }),
  );

  const issueMaintainerCloses = calculateThroughput(
    issues.filter((i: { closedBy: string }) => {
      return i.closedBy && !i.closedBy.toLowerCase().includes('bot');
    }),
  );

  process.stdout.write(
    `throughput_pr_overall_per_day,${Math.round(prOverall * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_pr_maintainers_authored_per_day,${Math.round(prMaintainerAuthored * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_pr_maintainers_merges_per_day,${Math.round(prMaintainerMerges * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_pr_community_per_day,${Math.round(prCommunityAuthored * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_overall_per_day,${Math.round(issueOverall * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_maintainers_authored_per_day,${Math.round(issueMaintainerAuthored * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_maintainers_closes_per_day,${Math.round(issueMaintainerCloses * 100) / 100}\n`,
  );
  process.stdout.write(
    `throughput_issue_community_per_day,${Math.round(issueCommunityAuthored * 100) / 100}\n`,
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
