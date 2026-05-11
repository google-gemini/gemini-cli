/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = async ({ github, context, core }) => {
  core.info('Fetching open issues to check for multiple area labels...');

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100,
  });

  let cleanedCount = 0;

  for (const issue of issues) {
    // Skip pull requests
    if (issue.pull_request) continue;

    const areaLabels = issue.labels
      .filter((l) => l.name && l.name.startsWith('area/'))
      .map((l) => l.name);

    if (areaLabels.length > 1) {
      core.info(
        `Issue #${issue.number} has multiple area labels: ${areaLabels.join(', ')}`,
      );

      // Keep the first one, remove the rest
      for (let i = 1; i < areaLabels.length; i++) {
        const labelToRemove = areaLabels[i];
        try {
          await github.rest.issues.removeLabel({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            name: labelToRemove,
          });
          core.info(
            `Successfully removed ${labelToRemove} from #${issue.number}`,
          );
        } catch (error) {
          core.warning(
            `Failed to remove ${labelToRemove} from #${issue.number}: ${error.message}`,
          );
        }
      }
      cleanedCount++;
    }
  }

  core.info(`Cleaned up multiple area labels from ${cleanedCount} issues.`);
};
