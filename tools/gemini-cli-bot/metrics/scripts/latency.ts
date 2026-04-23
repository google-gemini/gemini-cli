/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
    `gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data.repository;

  const prs = data.pullRequests.nodes.map((p: any) => ({
    association: p.authorAssociation,
    latencyHours:
      (new Date(p.mergedAt).getTime() - new Date(p.createdAt).getTime()) /
      (1000 * 60 * 60),
  }));
  const issues = data.issues.nodes.map((i: any) => ({
    association: i.authorAssociation,
    latencyHours:
      (new Date(i.closedAt).getTime() - new Date(i.createdAt).getTime()) /
      (1000 * 60 * 60),
  }));

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);
  const calculateAvg = (items: any[]) =>
    items.length
      ? items.reduce((a, b) => a + b.latencyHours, 0) / items.length
      : 0;

  const prMaintainers = calculateAvg(
    prs.filter((i: any) => isMaintainer(i.association)),
  );
  const prCommunity = calculateAvg(
    prs.filter((i: any) => !isMaintainer(i.association)),
  );
  const prOverall = calculateAvg(prs);

  const issueMaintainers = calculateAvg(
    issues.filter((i: any) => isMaintainer(i.association)),
  );
  const issueCommunity = calculateAvg(
    issues.filter((i: any) => !isMaintainer(i.association)),
  );
  const issueOverall = calculateAvg(issues);

  const timestamp = new Date().toISOString();

  const metrics = [
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
