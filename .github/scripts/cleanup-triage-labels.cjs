/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');

module.exports = async ({ github, context, core }) => {
  let issuesToCleanup = [];
  try {
    const fileContent = fs.readFileSync('issues_to_cleanup.json', 'utf8');
    issuesToCleanup = JSON.parse(fileContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      core.info('No issues found to clean up.');
      return;
    }
    core.setFailed(`Failed to read issues_to_cleanup.json: ${error.message}`);
    return;
  }

  for (const issue of issuesToCleanup) {
    try {
      await github.rest.issues.removeLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        name: 'status/need-triage',
      });
      core.info(
        `Successfully removed status/need-triage from #${issue.number}`,
      );
    } catch (error) {
      if (error.status === 404) {
        core.info(
          `Label status/need-triage not found on #${issue.number}, skipping.`,
        );
      } else {
        core.warning(
          `Failed to remove label from #${issue.number}: ${error.message}`,
        );
      }
    }
  }

  core.info(
    `Cleaned up status/need-triage from ${issuesToCleanup.length} issues.`,
  );
};
