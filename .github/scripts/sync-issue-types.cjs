/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');

module.exports = async ({ github, context, core }) => {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 50, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            id
            number
            title
            body
            issueType {
              name
            }
            labels(first: 20) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await github.graphql(query, {
      owner: context.repo.owner,
      repo: context.repo.repo,
    });

    const issues = result.repository.issues.nodes;
    const issuesNeedingAnalysis = [];
    let syncedCount = 0;

    for (const issue of issues) {
      if (issue.issueType === null) {
        const labelNames = issue.labels.nodes.map((l) => l.name);
        const hasBug = labelNames.includes('kind/bug');
        const hasFeature =
          labelNames.includes('kind/feature') ||
          labelNames.includes('kind/enhancement');

        let issueTypeId = null;
        if (hasBug) {
          issueTypeId = 'IT_kwDOCaSVvs4BR7vP'; // Bug
        } else if (hasFeature) {
          issueTypeId = 'IT_kwDOCaSVvs4BR7vQ'; // Feature
        }

        if (issueTypeId) {
          await github.graphql(
            `
            mutation($issueId: ID!, $issueTypeId: ID!) {
              updateIssue(input: {id: $issueId, issueTypeId: $issueTypeId}) {
                issue {
                  id
                }
              }
            }
          `,
            {
              issueId: issue.id,
              issueTypeId: issueTypeId,
            },
          );
          core.info(`Successfully synced Issue Type for #${issue.number}`);
          syncedCount++;
        } else {
          // Needs analysis to determine kind/type
          issuesNeedingAnalysis.push({
            number: issue.number,
            title: issue.title,
            body: issue.body,
          });
        }
      }
    }

    // Write issues needing analysis to a file so the AI can process them
    fs.writeFileSync(
      'no_type_issues.json',
      JSON.stringify(issuesNeedingAnalysis),
    );
    core.info(`Synced ${syncedCount} issues from labels.`);
    core.info(
      `Found ${issuesNeedingAnalysis.length} issues missing both type and kind label to be analyzed.`,
    );
  } catch (error) {
    core.setFailed(`Failed to sync issue types: ${error.message}`);
  }
};
