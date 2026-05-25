/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = async ({ github, context, core }) => {
  const extractJson = (raw) => {
    if (!raw || raw === '[]' || raw === '') return [];
    try {
      // First, try to parse the raw output as JSON.
      return JSON.parse(raw);
    } catch {
      // If that fails, check for a markdown code block.
      core.info(
        'Direct JSON parsing failed. Trying to extract from a markdown block.',
      );
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (markdownError) {
          core.warning(
            `Failed to parse extracted JSON from markdown block: ${markdownError.message}`,
          );
        }
      }

      // Try to find a raw JSON array in the output.
      const jsonArrayMatch = raw.match(
        /\[\s*\{\s*"issue_number"[\s\S]*\}\s*\]/,
      );
      if (jsonArrayMatch) {
        try {
          return JSON.parse(jsonArrayMatch[0]);
        } catch {
          const fallbackMatch = raw.match(/(\[\s*\{\s*"issue_number"[\s\S]*)/);
          if (fallbackMatch) {
            try {
              const cleaned = fallbackMatch[0].substring(
                0,
                fallbackMatch[0].lastIndexOf(']') + 1,
              );
              return JSON.parse(cleaned);
            } catch (fallbackError) {
              core.warning(
                `Failed to parse extracted JSON using fallback regex: ${fallbackError.message}`,
              );
            }
          }
        }
      }
    }
    core.warning('No valid JSON could be extracted from input.');
    return [];
  };

  // Collect all outputs from environment variables
  // Prioritize EFFORT results over STANDARD results by processing Effort FIRST
  // so that its labels appear first in the merged arrays (and thus win in mutually exclusive logic)
  const effortRaw = process.env.LABELS_OUTPUT_EFFORT;
  const standardRaw = process.env.LABELS_OUTPUT_STANDARD;
  const genericRaw = process.env.LABELS_OUTPUT;

  const resultsByIssue = new Map();

  const processResults = (results, _sourceName) => {
    for (const entry of results) {
      const issueNumber = entry.issue_number;
      if (!issueNumber) continue;

      if (!resultsByIssue.has(issueNumber)) {
        resultsByIssue.set(issueNumber, {
          issue_number: issueNumber,
          labels_to_add: [...(entry.labels_to_add || [])],
          labels_to_remove: [...(entry.labels_to_remove || [])],
          explanation: entry.explanation || '',
          effort_analysis: entry.effort_analysis || '',
        });
      } else {
        const existing = resultsByIssue.get(issueNumber);
        // Combine labels
        existing.labels_to_add = [
          ...new Set([
            ...existing.labels_to_add,
            ...(entry.labels_to_add || []),
          ]),
        ];
        existing.labels_to_remove = [
          ...new Set([
            ...existing.labels_to_remove,
            ...(entry.labels_to_remove || []),
          ]),
        ];

        // Combine explanations (if different)
        if (
          entry.explanation &&
          !existing.explanation.includes(entry.explanation)
        ) {
          existing.explanation = existing.explanation
            ? `${existing.explanation}\n\n${entry.explanation}`
            : entry.explanation;
        }

        // Take effort analysis if present
        if (entry.effort_analysis && !existing.effort_analysis) {
          existing.effort_analysis = entry.effort_analysis;
        }
      }
    }
  };

  // Order matters: Effort first so its labels win in conflict resolution
  processResults(extractJson(effortRaw), 'EFFORT');
  processResults(extractJson(standardRaw), 'STANDARD');
  processResults(extractJson(genericRaw), 'GENERIC');

  const finalResults = Array.from(resultsByIssue.values());
  core.info(`Aggregated triage results for ${finalResults.length} issues.`);

  for (const entry of finalResults) {
    const issueNumber = entry.issue_number;
    let labelsToAdd = entry.labels_to_add || [];
    let labelsToRemove = entry.labels_to_remove || [];
    let existingLabels = [];

    // Fetch existing labels early
    try {
      const { data: issueData } = await github.rest.issues.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
      });
      existingLabels = issueData.labels.map((l) =>
        typeof l === 'string' ? l : l.name,
      );
    } catch (e) {
      core.warning(
        `Failed to fetch existing labels for #${issueNumber}: ${e.message}`,
      );
    }

    // Programmatic Priority Downgrade Logic
    if (labelsToAdd.includes('status/need-information')) {
      const targetPriority = labelsToAdd.find((l) => l.startsWith('priority/'));
      if (targetPriority) {
        let downgradedPriority = null;
        if (targetPriority === 'priority/p0')
          downgradedPriority = 'priority/p1';
        if (targetPriority === 'priority/p1')
          downgradedPriority = 'priority/p2';

        if (downgradedPriority) {
          core.info(
            `Programmatically downgrading ${targetPriority} to ${downgradedPriority} due to status/need-information`,
          );
          labelsToAdd = labelsToAdd.filter((l) => l !== targetPriority);
          labelsToAdd.push(downgradedPriority);
        }
      }
    }

    labelsToRemove.push('status/need-triage');

    if (
      labelsToAdd.includes('status/manual-triage') ||
      existingLabels.includes('status/manual-triage')
    ) {
      labelsToRemove.push('status/bot-triaged');
      labelsToAdd = labelsToAdd.filter((l) => l !== 'status/bot-triaged');
    } else {
      labelsToAdd.push('status/bot-triaged');
    }

    // Resolve internal conflicts (e.g., adding P1 and P2)
    // We already resolved these by putting Effort first in the combined list

    // Resolve external conflicts with existing labels
    if (labelsToAdd.some((l) => l.startsWith('area/'))) {
      labelsToRemove.push(
        ...existingLabels.filter((l) => l.startsWith('area/')),
      );
    }
    if (labelsToAdd.some((l) => l.startsWith('priority/'))) {
      labelsToRemove.push(
        ...existingLabels.filter((l) => l.startsWith('priority/')),
      );
    }
    if (labelsToAdd.some((l) => l.startsWith('kind/'))) {
      labelsToRemove.push(
        ...existingLabels.filter((l) => l.startsWith('kind/')),
      );
    }

    // Enforce mutual exclusivity in the TO-ADD list (Architect wins)
    const exclusivePrefixes = ['area/', 'priority/', 'kind/'];
    for (const prefix of exclusivePrefixes) {
      const filtered = labelsToAdd.filter((l) => l.startsWith(prefix));
      if (filtered.length > 1) {
        const winner = filtered[0]; // First one wins
        core.info(
          `Issue #${issueNumber} has multiple ${prefix} labels suggested. Keeping "${winner}" and discarding others.`,
        );
        labelsToAdd = labelsToAdd.filter(
          (l) => !l.startsWith(prefix) || l === winner,
        );
      }
    }

    // Final deduplication and cleanup
    labelsToRemove = [...new Set(labelsToRemove)].filter(
      (l) => !labelsToAdd.includes(l) && existingLabels.includes(l),
    );
    labelsToAdd = [...new Set(labelsToAdd)].filter(
      (l) => !existingLabels.includes(l),
    );

    // Batch label operations
    if (labelsToAdd.length > 0) {
      await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        labels: labelsToAdd,
      });
      core.info(
        `Successfully added labels for #${issueNumber}: ${labelsToAdd.join(', ')}`,
      );
    }

    if (labelsToRemove.length > 0) {
      for (const label of labelsToRemove) {
        try {
          await github.rest.issues.removeLabel({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issueNumber,
            name: label,
          });
        } catch (e) {
          if (e.status !== 404)
            core.warning(
              `Failed to remove label ${label} from #${issueNumber}: ${e.message}`,
            );
        }
      }
      core.info(
        `Successfully removed labels for #${issueNumber}: ${labelsToRemove.join(', ')}`,
      );
    }

    // Post comment if needed
    const needsInfoAdded =
      labelsToAdd.includes('status/need-information') &&
      !existingLabels.includes('status/need-information');
    const hasEffortAnalysis = !!entry.effort_analysis;

    if (needsInfoAdded || hasEffortAnalysis) {
      let commentBody = '';
      if (needsInfoAdded && entry.explanation) commentBody += entry.explanation;
      if (hasEffortAnalysis) {
        if (commentBody) commentBody += '\n\n';
        commentBody += `**Effort Analysis:**\n${entry.effort_analysis}`;
      }

      if (commentBody) {
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueNumber,
          body: commentBody,
        });
        core.info(`Posted required comment for #${issueNumber}`);
      }
    }
  }
};
