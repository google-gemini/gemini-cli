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
  const output = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`, { encoding: 'utf-8' });
  const data = JSON.parse(output).data.repository;
  
  const prs = data.pullRequests.nodes.map(p => ({
    association: p.authorAssociation,
    date: new Date(p.mergedAt).getTime()
  })).sort((a, b) => a.date - b.date);
  
  const issues = data.issues.nodes.map(i => ({
    association: i.authorAssociation,
    date: new Date(i.closedAt).getTime()
  })).sort((a, b) => a.date - b.date);
  
  const isMaintainer = (assoc) => ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);
  
  const calculateThroughput = (items) => {
    if (items.length < 2) return 0;
    const first = items[0].date;
    const last = items[items.length - 1].date;
    const days = (last - first) / (1000 * 60 * 60 * 24);
    return days > 0 ? items.length / days : items.length; // items per day
  };
  
  const prOverall = calculateThroughput(prs);
  const prMaintainers = calculateThroughput(prs.filter(i => isMaintainer(i.association)));
  const prCommunity = calculateThroughput(prs.filter(i => !isMaintainer(i.association)));
  
  const issueOverall = calculateThroughput(issues);
  const issueMaintainers = calculateThroughput(issues.filter(i => isMaintainer(i.association)));
  const issueCommunity = calculateThroughput(issues.filter(i => !isMaintainer(i.association)));
  
  const timestamp = new Date().toISOString();
  
  const metrics = [
    { metric: 'throughput_pr_overall_per_day', value: Math.round(prOverall * 100) / 100, timestamp },
    { metric: 'throughput_pr_maintainers_per_day', value: Math.round(prMaintainers * 100) / 100, timestamp },
    { metric: 'throughput_pr_community_per_day', value: Math.round(prCommunity * 100) / 100, timestamp },
    { metric: 'throughput_issue_overall_per_day', value: Math.round(issueOverall * 100) / 100, timestamp },
    { metric: 'throughput_issue_maintainers_per_day', value: Math.round(issueMaintainers * 100) / 100, timestamp },
    { metric: 'throughput_issue_community_per_day', value: Math.round(issueCommunity * 100) / 100, timestamp },
    { metric: 'throughput_issue_overall_days_per_issue', value: issueOverall > 0 ? Math.round((1/issueOverall) * 100) / 100 : 0, timestamp },
    { metric: 'throughput_issue_maintainers_days_per_issue', value: issueMaintainers > 0 ? Math.round((1/issueMaintainers) * 100) / 100 : 0, timestamp },
    { metric: 'throughput_issue_community_days_per_issue', value: issueCommunity > 0 ? Math.round((1/issueCommunity) * 100) / 100 : 0, timestamp }
  ];
  
  metrics.forEach(m => process.stdout.write(JSON.stringify(m) + '\n'));
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
