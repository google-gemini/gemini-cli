/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { updateSimulationCsv, execGh, getRepoInfo, getMaintainers, getMaintainerWorkload } from './utils.js';

const EXECUTE_ACTIONS = process.env.EXECUTE_ACTIONS === 'true';

async function run() {
  const { owner, repo } = getRepoInfo();
  console.log(`PR Nudge starting for ${owner}/${repo}... (EXECUTE_ACTIONS=${EXECUTE_ACTIONS})`);

  try {
    const MAINTAINERS = await getMaintainers();
    const WORKLOAD = await getMaintainerWorkload();

    // 1. Fetch community PRs
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 500, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            author { login }
            authorAssociation
            createdAt
            updatedAt
            isDraft
            reviewDecision
            mergeable
            assignees(first: 1) { nodes { login } }
            commits(last: 1) {
              nodes {
                commit {
                  statusCheckRollup {
                    state
                  }
                }
              }
            }
            labels(first: 20) {
              nodes { name }
            }
          }
        }
      }
    }
    `;
    const output = execSync(`gh api graphql -F owner=${owner} -F repo=${repo} -f query='${query}'`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const data = JSON.parse(output).data.repository;
    const prs = data.pullRequests.nodes;

    const actions = [];
    const now = new Date();

    // Sort maintainers by workload (ascending)
    const sortedMaintainers = MAINTAINERS
      .filter(m => m !== 'TOTAL_MAINTAINERS')
      .sort((a, b) => (WORKLOAD[a] || 0) - (WORKLOAD[b] || 0));

    let mIndex = 0;

    for (const pr of prs) {
      if (['MEMBER', 'OWNER', 'COLLABORATOR'].includes(pr.authorAssociation)) continue;
      if (pr.isDraft) continue;

      const ciState = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
      const isCiSuccess = ciState === 'SUCCESS';
      const isMergeable = pr.mergeable === 'MERGEABLE';
      const isConflicting = pr.mergeable === 'CONFLICTING';

      const updatedAt = new Date(pr.updatedAt);
      const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const hoursSinceUpdate = daysSinceUpdate * 24;

      const hasNudgeLabel = pr.labels.nodes.some(l => l.name === 'status/nudge');
      const hasConflictLabel = pr.labels.nodes.some(l => l.name === 'status/merge-conflict');
      const hasAssignee = pr.assignees.nodes.length > 0;

      // 1. Terminal State: Close stale conflicts
      if (isConflicting && hasConflictLabel && daysSinceUpdate > 14) {
          actions.push({
              number: pr.number,
              type: 'close-conflict',
              comment: `Hi @${pr.author?.login || 'author'}! This PR has had merge conflicts for over 14 days. We are closing it to keep the queue manageable. Please feel free to reopen it once you have resolved the conflicts and synchronized with the main branch.`
          });
          continue;
      }

      // 2. Author Nudge for Conflicts
      if (isConflicting && !hasConflictLabel) {
          actions.push({
              number: pr.number,
              type: 'author-nudge-conflict',
              comment: `Hi @${pr.author?.login || 'author'}! It looks like this PR has merge conflicts. Could you please resolve them so that maintainers can review your changes? Thanks!`
          });
          continue;
      }

      // 3. Maintainer Action for Ready PRs
      if (isCiSuccess && isMergeable && pr.reviewDecision === 'REVIEW_REQUIRED') {
        if (!hasAssignee) {
           // Assign a maintainer based on workload
           const assignee = sortedMaintainers[mIndex % sortedMaintainers.length];
           mIndex++;
           WORKLOAD[assignee] = (WORKLOAD[assignee] || 0) + 1;

           actions.push({
               number: pr.number,
               type: 'assign-reviewer',
               assignee,
               comment: `Hi @${assignee}! This community PR by @${pr.author?.login || 'author'} is ready for review (Mergeable + CI Success). Assigning to you based on current workload.`
           });
        } else if (hoursSinceUpdate > 48 && !hasNudgeLabel) {
          // Nudge existing assignee if inactive for 48 hours
          actions.push({
            number: pr.number,
            type: 'maintainer-nudge',
            comment: `Hi @${pr.assignees.nodes[0].login}! This PR is ready and has been inactive for over 48 hours. Could you please take a look?`
          });
        }
      }
    }

    // 2. Execute actions
    const simulationUpdates = new Map<string, Record<string, string>>();

    for (const action of actions) {
      try {
        if (action.type === 'author-nudge-conflict') {
            await execGh(`pr edit ${action.number} --add-label "status/merge-conflict"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { labels: 'status/merge-conflict' });
        } else if (action.type === 'close-conflict') {
            await execGh(`pr close ${action.number}`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { state: 'CLOSED' });
        } else if (action.type === 'assign-reviewer') {
            await execGh(`pr edit ${action.number} --add-assignee "${action.assignee}" --add-label "status/nudge"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { assignee: action.assignee, labels: 'status/nudge' });
        } else if (action.type === 'maintainer-nudge') {
            await execGh(`pr edit ${action.number} --add-label "status/nudge"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { labels: 'status/nudge' });
        }

        if (action.comment) {
          await execGh(`pr comment ${action.number} --body "${action.comment}"`, EXECUTE_ACTIONS);
        }
      } catch (err) {
        console.error(`Failed to process PR #${action.number}:`, err);
      }
    }

    // 3. Update simulation
    await updateSimulationCsv('prs-after.csv', simulationUpdates);

    console.log(`Processed ${actions.length} PR nudges/actions.`);

  } catch (err) {
    console.error('Error in PR Nudge:', err);
    process.exit(1);
  }
}

run();
