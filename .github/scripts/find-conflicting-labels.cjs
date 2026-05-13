/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');

module.exports = async ({ github, context, core }) => {
  core.info('Fetching open issues to check for conflicting labels...');

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100,
  });

  const conflictingLabelIssues = [];

  for (const issue of issues) {
    if (issue.pull_request) continue;

    const areaLabels = issue.labels
      .filter((l) => l.name && l.name.startsWith('area/'))
      .map((l) => l.name);

    const priorityLabels = issue.labels
      .filter((l) => l.name && l.name.startsWith('priority/'))
      .map((l) => l.name);

    if (areaLabels.length > 1 || priorityLabels.length > 1) {
      let message = `Issue #${issue.number} has conflicting labels:`;
      if (areaLabels.length > 1)
        message += ` multiple areas (${areaLabels.join(', ')}).`;
      if (priorityLabels.length > 1)
        message += ` multiple priorities (${priorityLabels.join(', ')}).`;

      core.info(message);

      conflictingLabelIssues.push({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
      });
    }
  }

  // Limit to 50 to avoid overwhelming the AI in a single run
  const issuesToProcess = conflictingLabelIssues.slice(0, 50);

  fs.writeFileSync(
    'conflicting_labels_issues.json',
    JSON.stringify(issuesToProcess, null, 2),
  );

  core.info(
    `Found ${conflictingLabelIssues.length} issues with conflicting labels. Wrote ${issuesToProcess.length} to conflicting_labels_issues.json`,
  );
};
