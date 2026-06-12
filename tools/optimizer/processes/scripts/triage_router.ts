/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { getMaintainers, execGh, getRepoInfo, updateSimulationCsv, getMaintainerWorkload } from './utils.js';

const EXECUTE_ACTIONS = process.env.EXECUTE_ACTIONS === 'true';

async function run() {
  const { owner, repo } = getRepoInfo();
  console.log(`Triage Router starting for ${owner}/${repo}... (EXECUTE_ACTIONS=${EXECUTE_ACTIONS})`);

  try {
    const MAINTAINERS = await getMaintainers();
    const WORKLOAD = await getMaintainerWorkload();
    console.log(`Fetched ${MAINTAINERS.length} maintainers and current workloads.`);

    // 1. Fetch untriaged issues (Increase limit to process the backlog)
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 1000, states: OPEN, labels: ["status/need-triage"], orderBy: {field: CREATED_AT, direction: ASC}) {
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
    
    // Sort maintainers by workload (ascending)
    const sortedMaintainers = MAINTAINERS
      .filter(m => m !== 'TOTAL_MAINTAINERS') // safeguard
      .sort((a, b) => (WORKLOAD[a] || 0) - (WORKLOAD[b] || 0));

    let mIndex = 0;

    for (const issue of issues) {
      if (issue.assignees.nodes.length > 0) continue;

      const body = issue.body || '';
      const title = issue.title.toLowerCase();

      // Better categorization
      const labelsToAdd: string[] = [];
      if (title.includes('bug') || body.toLowerCase().includes('expected behavior')) {
        labelsToAdd.push('type/bug');
      } else if (title.includes('feature') || title.includes('enhancement') || body.toLowerCase().includes('proposed change')) {
        labelsToAdd.push('type/feature');
      }

      // Low quality check
      if (body.length < 50 || title.length < 10 || !body.includes('###')) {
        actions.push({
          number: issue.number,
          type: 'needs-info',
          labelsToAdd: ['status/needs-info'],
          labelsToRemove: ['status/need-triage'],
          comment: `Hi @${issue.author?.login || 'author'}! Thank you for the report. This issue seems to be missing some critical information or doesn't follow the template. Could you please provide more details? Labeling as 'status/needs-info' for now.`
        });
        continue;
      }

      // Assign to the maintainer with the lowest workload
      const assignee = sortedMaintainers[mIndex % sortedMaintainers.length];
      mIndex++;
      // Increment local workload tracker to keep distribution even during this run
      WORKLOAD[assignee] = (WORKLOAD[assignee] || 0) + 1;

      actions.push({
        number: issue.number,
        type: 'assign',
        assignee,
        labelsToAdd: [...labelsToAdd, 'status/manual-triage'],
        labelsToRemove: ['status/need-triage'],
        comment: `Automated Triage: Assigning to @${assignee} based on current workload. Please categorize and set priority.`
      });
    }

    // 2. Execute actions
    const simulationUpdates = new Map<string, Record<string, string>>();

    for (const action of actions) {
      try {
        const addLabels = action.labelsToAdd?.map(l => `"${l}"`).join(',') || '';
        const removeLabels = action.labelsToRemove?.map(l => `"${l}"`).join(',') || '';
        
        let editCmd = `issue edit ${action.number}`;
        if (addLabels) editCmd += ` --add-label ${addLabels}`;
        if (removeLabels) editCmd += ` --remove-label ${removeLabels}`;
        if (action.assignee) editCmd += ` --add-assignee "${action.assignee}"`;

        await execGh(editCmd, EXECUTE_ACTIONS);
        simulationUpdates.set(action.number.toString(), { 
            labels: action.labelsToAdd?.join(', ') || '',
            assignee: action.assignee || ''
        });
        
        if (action.comment) {
          await execGh(`issue comment ${action.number} --body "${action.comment}"`, EXECUTE_ACTIONS);
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
