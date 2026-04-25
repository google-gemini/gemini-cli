/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * PR Nudge Script
 * 
 * Target: Community PRs with high latency (no maintainer touch in 48h).
 * Goal: Improve latency_pr_community_hours.
 */

const NUDGE_LABEL = 'status/waiting-on-maintainer';
const NUDGE_THRESHOLD_HOURS = 48;
const MAX_PRS_TO_CHECK = 500;

async function run() {
  console.log('🚀 Starting PR Nudge process...');

  try {
    // 1. Fetch open PRs
    // Increased limit to cover more PRs as the repo has ~490 open PRs.
    const { stdout: prsJson } = await execAsync(
      `gh pr list --state open --limit ${MAX_PRS_TO_CHECK} --json number,author,authorAssociation,updatedAt,createdAt,labels`
    );
    const prs = JSON.parse(prsJson);

    console.log(`🔍 Checking ${prs.length} open PRs for staleness...`);

    // 2. Identify maintainers (MEMBER, OWNER, COLLABORATOR)
    const isMaintainer = (assoc: string) => ['MEMBER', 'OWNER', 'COLLABORATOR'].includes(assoc);

    // Use a concurrency limit to avoid hitting rate limits or overwhelming the system
    const BATCH_SIZE = 5;
    let nudgeCount = 0;

    for (let i = 0; i < prs.length; i += BATCH_SIZE) {
      const batch = prs.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (pr: any) => {
        try {
          // Skip if author is a maintainer or bot
          if (isMaintainer(pr.authorAssociation) || pr.author.type === 'Bot') return;

          const prNumber = pr.number;
          const now = Date.now();
          
          // Check if already nudged
          const labels = pr.labels.map((l: any) => l.name);
          if (labels.includes(NUDGE_LABEL)) {
             return;
          }

          // 3. Fetch the timeline for the PR to check for maintainer activity
          // We use the REST API via gh api to get structured timeline events.
          const { stdout: timelineJson } = await execAsync(
            `gh api repos/:owner/:repo/issues/${prNumber}/timeline --paginate`
          );
          const timeline = JSON.parse(timelineJson);

          // Filter for events that represent maintainer engagement
          const maintainerEvents = timeline.filter((event: any) => {
            const isEngagementEvent = [
              'commented', 
              'reviewed', 
              'labeled', 
              'assigned', 
              'review_requested', 
              'review_request_removed',
              'milestoned',
              'demilestoned'
            ].includes(event.event);

            if (!isEngagementEvent) return false;

            // Check if the event was performed by a maintainer
            // author_association is present on comments and reviews.
            // For other events, we might need to check the actor's association if available,
            // but usually gh api timeline includes it for most events in this context.
            const association = event.author_association || event.authorAssociation;
            if (association && isMaintainer(association)) return true;

            // Fallback: if it's a review or comment, the user object might have it in some API versions
            const user = event.user || event.actor;
            if (user && user.type === 'Bot') return false; // Ignore automated bot actions

            return false;
          });

          const lastMaintainerEvent = maintainerEvents.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at || a.submitted_at || 0).getTime();
            const dateB = new Date(b.created_at || b.submitted_at || 0).getTime();
            return dateB - dateA;
          })[0];

          const lastActivityDate = lastMaintainerEvent 
            ? new Date(lastMaintainerEvent.created_at || lastMaintainerEvent.submitted_at).getTime()
            : new Date(pr.createdAt).getTime();

          const hoursSinceMaintainerActivity = (now - lastActivityDate) / (1000 * 60 * 60);

          if (hoursSinceMaintainerActivity > NUDGE_THRESHOLD_HOURS) {
            console.log(`🔔 Nudging PR #${prNumber} (Idle for ${Math.round(hoursSinceMaintainerActivity)}h)`);
            
            // Add label and comment
            await execAsync(`gh pr edit ${prNumber} --add-label "${NUDGE_LABEL}"`);
            await execAsync(`gh pr comment ${prNumber} --body "Hello maintainers! This community PR has been waiting for a response for over 48 hours. Could someone please take a look? @google-gemini/gemini-cli-maintainers"`);
            nudgeCount++;
          }
        } catch (error) {
          console.error(`❌ Error processing PR #${pr.number}:`, error);
        }
      }));
    }
    console.log(`✅ PR Nudge process complete. Nudged ${nudgeCount} PRs.`);
  } catch (error) {
    console.error('❌ Error in PR Nudge script:', error);
  }
}

run();
