/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'google-gemini/gemini-cli';
const [GITHUB_OWNER, GITHUB_REPO] = GITHUB_REPOSITORY.split('/');

const STALE_LABEL = 'stale';
const EXEMPT_LABELS = ['help-wanted', '🔒Maintainers only'];
const INACTIVE_DAYS_BEFORE_STALE = 14;
const INACTIVE_DAYS_BEFORE_CLOSE = 7;

async function runGh(args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`gh ${args}`);
    return stdout.trim();
  } catch (error: any) {
    console.error(`Error running gh ${args}:`, error.message);
    return '';
  }
}

function isMaintainer(association: string): boolean {
  return ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(association);
}

async function processStaleIssues() {
  console.log(`Fetching candidates for stale processing in ${GITHUB_REPOSITORY} via GraphQL...`);
  
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - INACTIVE_DAYS_BEFORE_STALE);

  // GraphQL query to get issues updated before the threshold
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, states: OPEN, orderBy: {field: UPDATED_AT, direction: ASC}) {
        nodes {
          number
          updatedAt
          labels(first: 10) { nodes { name } }
          comments(last: 1) {
            nodes {
              authorAssociation
            }
          }
        }
      }
    }
  }
  `;

  const output = await runGh(`api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`);
  if (!output) return;

  const data = JSON.parse(output);
  const issues = data.data.repository.issues.nodes;

  const tasks: Promise<any>[] = [];

  for (const issue of issues) {
    const { number, updatedAt, labels, comments } = issue;
    
    // Only process issues updated before our threshold
    if (new Date(updatedAt) > thresholdDate) continue;

    const labelNames = labels.nodes.map((l: any) => l.name);
    
    // Check exemptions
    if (EXEMPT_LABELS.some(exempt => labelNames.includes(exempt))) {
      console.log(`Issue #${number} is exempt due to labels.`);
      continue;
    }

    // Actor-awareness: Ensure the script does not nudge if the bottleneck is waiting on maintainers.
    // If there are no comments, it's likely waiting for triage.
    if (comments.nodes.length === 0) {
      console.log(`Issue #${number} has no comments; skipping to allow for maintainer triage.`);
      continue;
    }

    // Check if the last comment was by a maintainer. If not, it's waiting for maintainer response.
    const lastComment = comments.nodes[0];
    if (!isMaintainer(lastComment.authorAssociation)) {
      console.log(`Issue #${number} last comment was by community; skipping to avoid blocking them.`);
      continue;
    }

    const hasStaleLabel = labelNames.includes(STALE_LABEL);

    if (!hasStaleLabel) {
      // Mark as stale
      console.log(`Marking issue #${number} as stale.`);
      const message = `This issue has been inactive for ${INACTIVE_DAYS_BEFORE_STALE} days and is being marked as stale. It will be closed in ${INACTIVE_DAYS_BEFORE_CLOSE} days if no further activity occurs.`;
      tasks.push((async () => {
        await runGh(`issue edit ${number} --add-label "${STALE_LABEL}"`);
        await runGh(`issue comment ${number} --body "${message}"`);
      })());
    } else {
      // Check if it's been stale long enough to close
      const staleThresholdDate = new Date();
      staleThresholdDate.setDate(staleThresholdDate.getDate() - INACTIVE_DAYS_BEFORE_CLOSE);
      
      if (new Date(updatedAt) < staleThresholdDate) {
        console.log(`Closing stale issue #${number}.`);
        const closeMessage = `This issue has been stale for ${INACTIVE_DAYS_BEFORE_CLOSE} days and is now being closed. Please feel free to reopen it if the issue persists or if you have more information to provide.`;
        tasks.push(runGh(`issue close ${number} --comment "${closeMessage}"`));
      }
    }
  }

  await Promise.all(tasks);
  console.log(`Processed ${tasks.length} actions.`);
}

processStaleIssues().catch(console.error);
