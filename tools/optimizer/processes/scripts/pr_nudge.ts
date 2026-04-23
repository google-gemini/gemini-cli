/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { updateSimulationCsv, execGh, getRepoInfo } from './utils.js';

const EXECUTE_ACTIONS = process.env.EXECUTE_ACTIONS === 'true';

async function run() {
  const { owner, repo } = getRepoInfo();
  console.log(`PR Nudge starting for ${owner}/${repo}... (EXECUTE_ACTIONS=${EXECUTE_ACTIONS})`);

  try {
    // 1. Fetch community PRs that pass CI but need review
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 50, states: OPEN) {
          nodes {
            number
            author { login }
            authorAssociation
            createdAt
            updatedAt
            isDraft
            reviewDecision
            mergeable
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
    const output = execSync(`gh api graphql -F owner=${owner} -F repo=${repo} -f query='${query}'`, { encoding: 'utf-8' });
    const data = JSON.parse(output).data.repository;
    const prs = data.pullRequests.nodes;

    const actions = [];
    const now = new Date();

    for (const pr of prs) {
      if (['MEMBER', 'OWNER', 'COLLABORATOR'].includes(pr.authorAssociation)) continue;
      if (pr.isDraft) continue;

      const ciState = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
      const isCiSuccess = ciState === 'SUCCESS';
      const isMergeable = pr.mergeable === 'MERGEABLE';
      const isConflicting = pr.mergeable === 'CONFLICTING';

      const updatedAt = new Date(pr.updatedAt);
      const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

      const hasNudgeLabel = pr.labels.nodes.some(l => l.name === 'status/nudge');
      const hasConflictLabel = pr.labels.nodes.some(l => l.name === 'status/merge-conflict');

      // 1. Author Nudge for Conflicts
      if (isConflicting && !hasConflictLabel) {
          actions.push({
              number: pr.number,
              type: 'author-nudge-conflict',
              comment: `Hi @${pr.author?.login || 'author'}! It looks like this PR has merge conflicts. Could you please resolve them so that maintainers can review your changes? Thanks!`
          });
          continue;
      }

      // 2. Maintainer Nudge for Ready PRs
      if (isCiSuccess && isMergeable && pr.reviewDecision === 'REVIEW_REQUIRED') {
        // Nudge maintainers if ready and no activity for 48 hours
        if (hoursSinceUpdate > 48 && !hasNudgeLabel) {
          actions.push({
            number: pr.number,
            type: 'maintainer-nudge',
            comment: `Hi maintainers! This community PR by @${pr.author?.login || 'author'} has passed all CI checks and is mergeable. It has been open and inactive for over 48 hours. Could someone please take a look? @google-gemini/gemini-cli-maintainers`
          });
        }
      }
    }

    // 2. Execute actions
    const simulationUpdates = new Map<string, Record<string, string>>();

    for (const action of actions) {
      try {
        if (action.type === 'author-nudge-conflict') {
            execGh(`pr edit ${action.number} --add-label "status/merge-conflict"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { labels: 'status/merge-conflict' });
        } else if (action.type === 'maintainer-nudge') {
            execGh(`pr edit ${action.number} --add-label "status/nudge"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { labels: 'status/nudge' });
        }

        if (action.comment) {
          execGh(`pr comment ${action.number} --body "${action.comment}"`, EXECUTE_ACTIONS);
        }
      } catch (err) {
        console.error(`Failed to process PR #${action.number}:`, err);
      }
    }

    // 3. Update simulation
    await updateSimulationCsv('prs-after.csv', simulationUpdates);

    console.log(`Processed ${actions.length} PR nudges.`);

  } catch (err) {
    console.error('Error in PR Nudge:', err);
    process.exit(1);
  }
}

run();
