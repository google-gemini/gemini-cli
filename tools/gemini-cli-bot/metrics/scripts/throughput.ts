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
          mergedAt
        }
      }
    }
    issueSearch: search(query: $issueQuery, type: ISSUE, first: 1000) {
      nodes {
        ... on Issue {
          authorAssociation
          closedAt
        }
      }
    }
  }
  `;

  const prQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:pr is:merged merged:>=${dateStr}`;
  const issueQuery = `repo:${GITHUB_OWNER}/${GITHUB_REPO} is:issue is:closed closed:>=${dateStr}`;

  const output = execSync(
    `gh api graphql -F prQuery='${prQuery}' -F issueQuery='${issueQuery}' -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data;
  if (!data) {
    throw new Error('No data returned from GraphQL API');
  }

  const prs = (data.prSearch?.nodes || []).map((p: any) => ({
    association: p.authorAssociation,
    date: new Date(p.mergedAt).getTime(),
  }));

  const issues = (data.issueSearch?.nodes || []).map((i: any) => ({
    association: i.authorAssociation,
    date: new Date(i.closedAt).getTime(),
  }));

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

  const calculateThroughput = (
    items: { association: string; date: number }[],
  ) => {
    return items.length / 7; // items per day over 7-day window
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
