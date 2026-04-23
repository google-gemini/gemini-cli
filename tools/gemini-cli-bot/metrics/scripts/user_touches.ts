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
          comments { totalCount }
          reviews { totalCount }
        }
      }
      issues(last: 100, states: CLOSED) {
        nodes {
          authorAssociation
          comments { totalCount }
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

  const prs = data.pullRequests.nodes;
  const issues = data.issues.nodes;

  const allItems = [
    ...prs.map((p: any) => ({
      association: p.authorAssociation,
      touches: p.comments.totalCount + (p.reviews ? p.reviews.totalCount : 0),
    })),
    ...issues.map((i: any) => ({
      association: i.authorAssociation,
      touches: i.comments.totalCount,
    })),
  ];

  const isMaintainer = (assoc: string) =>
    ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

  const calculateAvg = (items: any[]) =>
    items.length ? items.reduce((a, b) => a + b.touches, 0) / items.length : 0;

  const overall = calculateAvg(allItems);
  const maintainers = calculateAvg(
    allItems.filter((i) => isMaintainer(i.association)),
  );
  const community = calculateAvg(
    allItems.filter((i) => !isMaintainer(i.association)),
  );

  const timestamp = new Date().toISOString();

  process.stdout.write(
    JSON.stringify({
      metric: 'user_touches_overall',
      value: Math.round(overall * 100) / 100,
      timestamp,
    }) + '\n',
  );
  process.stdout.write(
    JSON.stringify({
      metric: 'user_touches_maintainers',
      value: Math.round(maintainers * 100) / 100,
      timestamp,
    }) + '\n',
  );
  process.stdout.write(
    JSON.stringify({
      metric: 'user_touches_community',
      value: Math.round(community * 100) / 100,
      timestamp,
    }) + '\n',
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
