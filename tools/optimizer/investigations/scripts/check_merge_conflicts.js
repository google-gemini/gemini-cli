/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

async function run() {
  try {
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, states: OPEN) {
          nodes {
            number
            author { login }
            authorAssociation
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
          }
        }
      }
    }
    `;
    const output = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`, { encoding: 'utf-8' });
    const data = JSON.parse(output).data.repository;
    const prs = data.pullRequests.nodes;

    const communityPrs = prs.filter(p => !['MEMBER', 'OWNER', 'COLLABORATOR'].includes(p.authorAssociation));
    const stats = {
        conflicting: 0,
        mergeable: 0,
        unknown: 0,
        reviewRequired: 0,
        approved: 0,
        changesRequested: 0,
        ciSuccess: 0,
        ciFailure: 0,
        ciPending: 0,
        readyForReview: 0
    };

    for (const p of communityPrs) {
        const isMergeable = p.mergeable === 'MERGEABLE';
        const ciState = p.commits?.nodes[0]?.commit?.statusCheckRollup?.state;
        const isCiSuccess = ciState === 'SUCCESS';

        if (p.mergeable === 'CONFLICTING') stats.conflicting++;
        else if (isMergeable) stats.mergeable++;
        else stats.unknown++;

        if (p.reviewDecision === 'REVIEW_REQUIRED') stats.reviewRequired++;
        else if (p.reviewDecision === 'APPROVED') stats.approved++;
        else if (p.reviewDecision === 'CHANGES_REQUESTED') stats.changesRequested++;

        if (isCiSuccess) stats.ciSuccess++;
        else if (ciState === 'FAILURE') stats.ciFailure++;
        else stats.ciPending++;

        if (isMergeable && isCiSuccess && p.reviewDecision === 'REVIEW_REQUIRED') {
            stats.readyForReview++;
        }
    }

    console.log('Stats for Community PRs:', stats);

  } catch (err) {
    console.error('Error checking merge conflicts:', err);
    process.exit(1);
  }
}

run();
