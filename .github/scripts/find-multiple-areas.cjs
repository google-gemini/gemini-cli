/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');

module.exports = async ({ github, context, core }) => {
  core.info('Fetching open issues to check for multiple area labels...');

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100,
  });

  const multipleAreaIssues = [];

  for (const issue of issues) {
    if (issue.pull_request) continue;

    const areaLabels = issue.labels
      .filter((l) => l.name && l.name.startsWith('area/'))
      .map((l) => l.name);

    if (areaLabels.length > 1) {
      core.info(
        `Issue #${issue.number} has multiple area labels: ${areaLabels.join(', ')}`,
      );
      multipleAreaIssues.push({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
      });
    }
  }

  // Limit to 20 to avoid overwhelming the AI in a single run
  const issuesToProcess = multipleAreaIssues.slice(0, 20);

  fs.writeFileSync(
    'multiple_area_issues.json',
    JSON.stringify(issuesToProcess, null, 2),
  );

  core.info(
    `Found ${multipleAreaIssues.length} issues with multiple area labels. Wrote ${issuesToProcess.length} to multiple_area_issues.json`,
  );
};
