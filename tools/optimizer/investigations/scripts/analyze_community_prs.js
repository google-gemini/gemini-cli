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
      pullRequests(first: 100, states: OPEN) {
        nodes {
          number
          authorAssociation
          reviewDecision
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  }
  `;
  const output = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`, { encoding: 'utf-8' });
  const data = JSON.parse(output).data.repository;
  const prs = data.pullRequests.nodes;

  const communityPrs = prs.filter(p => !['MEMBER', 'OWNER', 'COLLABORATOR'].includes(p.authorAssociation));
  const waitingForReview = communityPrs.filter(p => p.reviewDecision === 'REVIEW_REQUIRED' && p.commits.nodes[0]?.commit?.statusCheckRollup?.state === 'SUCCESS');

  console.log(`Total Community PRs: ${communityPrs.length}`);
  console.log(`Community PRs with SUCCESS CI waiting for Review: ${waitingForReview.length}`);

} catch (err) {
  console.error('Error analyzing community PRs:', err);
  process.exit(1);
}
