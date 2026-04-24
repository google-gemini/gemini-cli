/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Stale Issue Management Reflex
 *
 * This script identifies issues with no activity for > 90 days and:
 * 1. Marks them with a 'stale' label.
 * 2. Adds a graceful closure warning comment.
 * 3. (Optional) Closes issues that have been 'stale' for an additional 14 days.
 */

const STALE_THRESHOLD_DAYS = 90;
const CLOSE_THRESHOLD_DAYS = 14;
const STALE_LABEL = 'stale';

const GRACEFUL_STALE_MESSAGE = `
This issue has been automatically marked as stale because it has not had recent activity. It will be closed in 14 days if no further activity occurs.

If you believe this issue is still relevant, please leave a comment or remove the stale label. Thank you for your contributions!
`.trim();

const GRACEFUL_CLOSE_MESSAGE = `
This issue has been automatically closed because it has been stale for 14 days with no further activity.

If you still experience this issue, please open a new issue with updated information and a link to this one. Thank you!
`.trim();

async function run() {
  console.log('--- Stale Issue Management ---');

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        issues(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: ASC}) {
          nodes {
            number
            updatedAt
            labels(first: 20) {
              nodes {
                name
              }
            }
            comments(last: 1) {
              nodes {
                createdAt
              }
            }
          }
        }
      }
    }
  `;

  try {
    const output = execSync(
      `gh api graphql -F owner=:owner -F name=:repo -f query='${query}'`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(output).data.repository;
    const issues = data.issues.nodes;

    for (const issue of issues) {
      const updatedAt = new Date(issue.updatedAt);
      const labels = issue.labels.nodes.map((l: any) => l.name);

      // Skip pinned or protected issues
      if (labels.includes('pinned') || labels.includes('🔒Maintainers only') || labels.includes('help-wanted')) {
        continue;
      }

      if (updatedAt < staleThreshold) {
        if (labels.includes(STALE_LABEL)) {
          // Check if it's been stale long enough to close
          const lastCommentDate = issue.comments.nodes[0] ? new Date(issue.comments.nodes[0].createdAt) : updatedAt;
          const closeThreshold = new Date(lastCommentDate.getTime() + CLOSE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

          if (now > closeThreshold) {
            console.log(`Closing stale issue #${issue.number}...`);
            try {
              execSync(`gh issue close ${issue.number} --comment ${JSON.stringify(GRACEFUL_CLOSE_MESSAGE)}`);
            } catch (e) {
              console.error(`Failed to close issue #${issue.number}:`, e);
            }
          }
        } else {
          // Mark as stale
          console.log(`Marking issue #${issue.number} as stale...`);
          try {
            execSync(`gh issue edit ${issue.number} --add-label ${STALE_LABEL}`);
            execSync(`gh issue comment ${issue.number} --body ${JSON.stringify(GRACEFUL_STALE_MESSAGE)}`);
          } catch (e) {
            console.error(`Failed to mark issue #${issue.number} as stale:`, e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error running stale management:', error);
  }
}

run();
