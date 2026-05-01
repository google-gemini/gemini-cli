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
  console.log(`Stale Manager starting for ${owner}/${repo}... (EXECUTE_ACTIONS=${EXECUTE_ACTIONS})`);

  try {
    // 1. Fetch open issues
    const issueQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 1000, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            authorAssociation
            updatedAt
            labels(first: 20) {
              nodes { name }
            }
          }
        }
      }
    }
    `;
    let issueOutput;
    try {
      issueOutput = execSync(`gh api graphql -F owner=${owner} -F repo=${repo} -f query='${issueQuery}'`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    } catch (err) {
      console.error('Failed to fetch issues from GitHub:', err);
      process.exit(1);
    }

    // 2. Fetch open PRs
    const prQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 500, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            authorAssociation
            updatedAt
            mergeable
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
            labels(first: 20) {
              nodes { name }
            }
          }
        }
      }
    }
    `;
    let prOutput;
    try {
      prOutput = execSync(`gh api graphql -F owner=${owner} -F repo=${repo} -f query='${prQuery}'`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    } catch (err) {
      console.error('Failed to fetch PRs from GitHub:', err);
      process.exit(1);
    }

    const issueData = JSON.parse(issueOutput).data.repository;
    const prData = JSON.parse(prOutput).data.repository;
    const items = [...issueData.issues.nodes.map(i => ({...i, type: 'issue'})), ...prData.pullRequests.nodes.map(p => ({...p, type: 'pr'}))];

    const now = new Date();
    const actions = [];

    for (const item of items) {
      const updatedAt = new Date(item.updatedAt);
      const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const isMaintainerOnly = item.labels.nodes.some(l => l.name === '🔒 maintainer only');
      const isStale = item.labels.nodes.some(l => l.name === 'Stale');
      const needsInfo = item.labels.nodes.some(l => l.name === 'status/needs-info');
      const isCommunity = !['MEMBER', 'OWNER', 'COLLABORATOR'].includes(item.authorAssociation);

      if (isMaintainerOnly) continue; // Maintainer issues have their own lifecycle

      // Special handling for needs-info: mark stale faster
      if (needsInfo && !isStale && daysSinceUpdate > 7) {
          actions.push({
              number: item.number,
              target: item.type,
              type: 'label',
              label: 'Stale',
              comment: `Hi! This ${item.type} was marked as 'status/needs-info' but has had no activity for 7 days. We are labeling it as 'Stale'. It will be closed in 14 days if no further activity occurs. Thank you!`
          });
          continue;
      }

      // Safeguard: Don't mark as stale if it's a PR ready for review (Maintainer bottleneck)
      if (item.type === 'pr') {
          const ciState = item.commits?.nodes[0]?.commit?.statusCheckRollup?.state;
          if (item.mergeable === 'MERGEABLE' && ciState === 'SUCCESS' && item.reviewDecision === 'REVIEW_REQUIRED') {
              continue;
          }

          // Special case: Persistent conflicts
          if (item.labels.nodes.some(l => l.name === 'status/merge-conflict') && daysSinceUpdate > 14) {
              actions.push({
                  number: item.number,
                  target: 'pr',
                  type: 'close',
                  comment: `This PR has had merge conflicts for over 14 days without resolution. Closing it for now to keep the queue manageable. Please feel free to reopen once conflicts are resolved.`
              });
              continue;
          }
      }

      if (isStale) {
        if (daysSinceUpdate > 14) {
          actions.push({
            number: item.number,
            target: item.type,
            type: 'close',
            comment: `This ${item.type} has been marked as stale for 14 days with no further activity. Closing it for now. If this is still relevant, please feel free to reopen with additional information.`
          });
        }
      } else if (daysSinceUpdate > 30 && isCommunity) {
        actions.push({
          number: item.number,
          target: item.type,
          type: 'label',
          label: 'Stale',
          comment: `This ${item.type} has been inactive for 30 days. We are labeling it as stale. If no further activity occurs within 14 days, it will be closed. Thank you for your contributions!`
        });
      }
    }

    // 2. Execute actions
    const issueSimulationUpdates = new Map<string, Record<string, string>>();
    const prSimulationUpdates = new Map<string, Record<string, string>>();

    for (const action of actions) {
      try {
        const cmdPrefix = action.target === 'pr' ? 'pr' : 'issue';
        const simulationMap = action.target === 'pr' ? prSimulationUpdates : issueSimulationUpdates;

        if (action.type === 'label') {
          await execGh(`${cmdPrefix} edit ${action.number} --add-label "${action.label}"`, EXECUTE_ACTIONS);
          simulationMap.set(action.number.toString(), { labels: action.label });
        }
        if (action.comment) {
          await execGh(`${cmdPrefix} comment ${action.number} --body "${action.comment}"`, EXECUTE_ACTIONS);
        }
        if (action.type === 'close') {
          await execGh(`${cmdPrefix} close ${action.number}`, EXECUTE_ACTIONS);
          simulationMap.set(action.number.toString(), { state: 'CLOSED' });
        }
      } catch (err) {
        console.error(`Failed to process ${action.target} #${action.number}:`, err);
      }
    }

    // 3. Update simulations
    await updateSimulationCsv('issues-after.csv', issueSimulationUpdates);
    await updateSimulationCsv('prs-after.csv', prSimulationUpdates);

    console.log(`Processed ${actions.length} stale issues/actions.`);

  } catch (err) {
    console.error('Error in Stale Manager:', err);
    process.exit(1);
  }
}

run();
