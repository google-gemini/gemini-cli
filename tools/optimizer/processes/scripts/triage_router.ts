/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { getMaintainers, execGh, getRepoInfo, updateSimulationCsv } from './utils.js';

const EXECUTE_ACTIONS = process.env.EXECUTE_ACTIONS === 'true';

async function run() {
  const { owner, repo } = getRepoInfo();
  console.log(`Triage Router starting for ${owner}/${repo}... (EXECUTE_ACTIONS=${EXECUTE_ACTIONS})`);

  try {
    const MAINTAINERS = await getMaintainers();
    console.log(`Fetched ${MAINTAINERS.length} maintainers.`);

    // 1. Fetch untriaged issues
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, labels: ["status/need-triage"]) {
          nodes {
            number
            title
            body
            author { login }
            assignees(first: 1) { nodes { login } }
            labels(first: 20) { nodes { name } }
          }
        }
      }
    }
    `;
    let output;
    try {
      output = execSync(`gh api graphql -F owner=${owner} -F repo=${repo} -f query='${query}'`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    } catch (err) {
      console.error('Failed to fetch untriaged issues from GitHub:', err);
      process.exit(1);
    }
    
    const data = JSON.parse(output).data.repository;
    const issues = data.issues.nodes;

    const actions = [];
    let maintainerIndex = Math.floor(Math.random() * MAINTAINERS.length);

    for (const issue of issues) {
      if (issue.assignees.nodes.length > 0) continue;

      const body = issue.body || '';
      const title = issue.title || '';

      // Low quality check
      if (body.length < 50 || title.length < 10 || !body.includes('###')) {
        actions.push({
          number: issue.number,
          type: 'needs-info',
          comment: `Hi @${issue.author?.login || 'author'}! Thank you for the report. This issue seems to be missing some critical information or doesn't follow the template. Could you please provide more details? Labeling as 'status/needs-info' for now.`
        });
        continue;
      }

      // Potential duplicate check (very naive but better than nothing)
      if (title.toLowerCase().includes('duplicate') || title.toLowerCase().includes('same as #')) {
          actions.push({
              number: issue.number,
              type: 'possible-duplicate',
              comment: `Hi @${issue.author?.login || 'author'}! This issue might be a duplicate of another existing issue. Labeling as 'status/possible-duplicate' for maintainer review.`
          });
          continue;
      }

      // Assign to a maintainer (round-robin)
      const assignee = MAINTAINERS[maintainerIndex % MAINTAINERS.length];
      maintainerIndex++;

      actions.push({
        number: issue.number,
        type: 'assign',
        assignee,
        comment: `Automated Triage: Assigning to @${assignee} for initial review. Please categorize and set priority.`
      });
    }

    // 2. Execute actions
    const simulationUpdates = new Map<string, Record<string, string>>();

    for (const action of actions) {
      try {
        if (action.type === 'needs-info') {
          execGh(`issue edit ${action.number} --add-label "status/needs-info" --remove-label "status/need-triage"`, EXECUTE_ACTIONS);
          simulationUpdates.set(action.number.toString(), { labels: 'status/needs-info' });
        } else if (action.type === 'possible-duplicate') {
            execGh(`issue edit ${action.number} --add-label "status/possible-duplicate" --remove-label "status/need-triage"`, EXECUTE_ACTIONS);
            simulationUpdates.set(action.number.toString(), { labels: 'status/possible-duplicate' });
        } else if (action.type === 'assign') {
          execGh(`issue edit ${action.number} --add-assignee "${action.assignee}" --remove-label "status/need-triage" --add-label "status/manual-triage"`, EXECUTE_ACTIONS);
          simulationUpdates.set(action.number.toString(), { labels: 'status/manual-triage' });
        }
        
        if (action.comment) {
          execGh(`issue comment ${action.number} --body "${action.comment}"`, EXECUTE_ACTIONS);
        }
      } catch (err) {
        console.error(`Failed to process issue #${action.number}:`, err);
      }
    }

    // 3. Update simulation
    await updateSimulationCsv('issues-after.csv', simulationUpdates);

    console.log(`Processed ${actions.length} issues.`);

  } catch (err) {
    console.error('Error in Triage Router:', err);
    process.exit(1);
  }
}

run();
