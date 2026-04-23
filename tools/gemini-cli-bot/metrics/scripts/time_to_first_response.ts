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
    `gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data.repository;

  const getFirstResponseTime = (item: any) => {
    const authorLogin = item.author?.login;
    let earliestResponse: number | null = null;

    const checkNodes = (nodes: any[]) => {
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

  const processItems = (items: any[]) => {
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

  const isMaintainer = (assoc: string) => ['MEMBER', 'OWNER'].includes(assoc);
  const is1P = (assoc: string) => ['COLLABORATOR'].includes(assoc);

  const calculateAvg = (items: any[]) =>
    items.length ? items.reduce((a, b) => a + b.ttfr, 0) / items.length : 0;

  const maintainers = calculateAvg(
    allItems.filter((i) => isMaintainer(i.association)),
  );
  const firstParty = calculateAvg(allItems.filter((i) => is1P(i.association)));
  const overall = calculateAvg(allItems);

  const timestamp = new Date().toISOString();

  const metrics = [
    {
      metric: 'time_to_first_response_overall_hours',
      value: Math.round(overall * 100) / 100,
      timestamp,
    },
    {
      metric: 'time_to_first_response_maintainers_hours',
      value: Math.round(maintainers * 100) / 100,
      timestamp,
    },
    {
      metric: 'time_to_first_response_1p_hours',
      value: Math.round(firstParty * 100) / 100,
      timestamp,
    },
  ];

  metrics.forEach((m) => process.stdout.write(JSON.stringify(m) + '\n'));
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
