/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = async ({ github, context, core }) => {
  const rawLabels = process.env.LABELS_OUTPUT;
  core.info(`Raw labels JSON: ${rawLabels}`);
  let parsedLabels;
  try {
    // First, try to parse the raw output as JSON.
    parsedLabels = JSON.parse(rawLabels);
  } catch (jsonError) {
    // If that fails, check for a markdown code block.
    core.warning(
      `Direct JSON parsing failed: ${jsonError.message}. Trying to extract from a markdown block.`,
    );
    const jsonMatch = rawLabels.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedLabels = JSON.parse(jsonMatch[1].trim());
      } catch (markdownError) {
        core.setFailed(
          `Failed to parse JSON even after extracting from markdown block: ${markdownError.message}\nRaw output: ${rawLabels}`,
        );
        return;
      }
    } else {
      // If no markdown block, try to find a raw JSON array in the output.
      // The CLI may include debug/log lines (e.g. telemetry init, YOLO mode)
      // before the actual JSON response.
      const jsonArrayMatch = rawLabels.match(
        /\[\s*\{\s*"issue_number"[\s\S]*\}\s*\]/,
      );
      if (jsonArrayMatch) {
        try {
          parsedLabels = JSON.parse(jsonArrayMatch[0]);
        } catch (extractError) {
          // It's possible the regex matched from a `[STARTUP]` log all the way to the end
          // of the JSON array. We need to be more aggressive and find the FIRST `[ { "issue_number"`
          core.warning(
            `Strict array match failed: ${extractError.message}. Attempting to clean leading noisy brackets.`,
          );
          const fallbackMatch = rawLabels.match(
            /(\[\s*\{\s*"issue_number"[\s\S]*)/,
          );
          if (fallbackMatch) {
            try {
              // We might have grabbed trailing noise too, so we find the last closing bracket
              const cleaned = fallbackMatch[0].substring(
                0,
                fallbackMatch[0].lastIndexOf(']') + 1,
              );
              parsedLabels = JSON.parse(cleaned);
            } catch (fallbackError) {
              core.setFailed(
                `Found JSON-like content but failed to parse: ${fallbackError.message}\nRaw output: ${rawLabels}`,
              );
              return;
            }
          } else {
            core.setFailed(
              `Found JSON-like content but failed to parse: ${extractError.message}\nRaw output: ${rawLabels}`,
            );
            return;
          }
        }
      } else {
        core.setFailed(
          `Output is not valid JSON and does not contain extractable JSON.\nRaw output: ${rawLabels}`,
        );
        return;
      }
    }
  }
  core.info(`Parsed labels JSON: ${JSON.stringify(parsedLabels)}`);

  for (const entry of parsedLabels) {
    const issueNumber = entry.issue_number;
    if (!issueNumber) {
      core.info(
        `Skipping entry with no issue number: ${JSON.stringify(entry)}`,
      );
      continue;
    }

    let labelsToAdd = entry.labels_to_add || [];
    let labelsToRemove = entry.labels_to_remove || [];

    labelsToRemove.push('status/need-triage');

    if (labelsToAdd.includes('status/manual-triage')) {
      // If the AI flagged it for manual triage, remove bot-triaged if it exists
      labelsToRemove.push('status/bot-triaged');
      // Ensure we don't accidentally try to add bot-triaged if the AI returned it
      labelsToAdd = labelsToAdd.filter((l) => l !== 'status/bot-triaged');
    } else {
      // Standard successful bot triage
      labelsToAdd.push('status/bot-triaged');
    }

    // Deduplicate arrays
    labelsToAdd = [...new Set(labelsToAdd)];
    labelsToRemove = [...new Set(labelsToRemove)];

    // Enforce mutually exclusive area labels
    const areaLabelsToAdd = labelsToAdd.filter((l) => l.startsWith('area/'));
    if (areaLabelsToAdd.length > 1) {
      core.warning(
        `Issue #${issueNumber} has multiple area labels to add: ${areaLabelsToAdd.join(', ')}. Keeping only the first one.`,
      );
      const firstArea = areaLabelsToAdd[0];
      labelsToAdd = labelsToAdd.filter(
        (l) => !l.startsWith('area/') || l === firstArea,
      );
    }

    // Enforce mutually exclusive priority labels
    const priorityLabelsToAdd = labelsToAdd.filter((l) =>
      l.startsWith('priority/'),
    );
    if (priorityLabelsToAdd.length > 1) {
      core.warning(
        `Issue #${issueNumber} has multiple priority labels to add: ${priorityLabelsToAdd.join(', ')}. Keeping only the first one.`,
      );
      const firstPriority = priorityLabelsToAdd[0];
      labelsToAdd = labelsToAdd.filter(
        (l) => !l.startsWith('priority/') || l === firstPriority,
      );
    }

    if (labelsToAdd.length > 0) {
      await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        labels: labelsToAdd,
      });

      const explanation = entry.explanation ? ` - ${entry.explanation}` : '';
      core.info(
        `Successfully added labels for #${issueNumber}: ${labelsToAdd.join(', ')}${explanation}`,
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
          if (e.status !== 404) {
            core.warning(
              `Failed to remove label ${label} from #${issueNumber}: ${e.message}`,
            );
          }
        }
      }
      core.info(
        `Successfully removed labels for #${issueNumber}: ${labelsToRemove.join(', ')}`,
      );
    }

    if (entry.explanation || entry.effort_analysis) {
      let commentBody = '';
      if (entry.explanation) {
        commentBody += entry.explanation;
      }
      if (entry.effort_analysis) {
        if (commentBody) commentBody += '\n\n';
        commentBody += `**Effort Analysis:**\n${entry.effort_analysis}`;
      }

      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        body: commentBody,
      });
    }

    if (
      (!entry.labels_to_add || entry.labels_to_add.length === 0) &&
      (!entry.labels_to_remove || entry.labels_to_remove.length === 0)
    ) {
      core.info(
        `No labels to add or remove for #${issueNumber}, leaving as is`,
      );
    }
  }
};
