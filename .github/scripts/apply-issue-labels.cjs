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
      `Direct JSON parsing failed: ${jsonError.message}. Trying to extract from a markdown block.`
    );
    const jsonMatch = rawLabels.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedLabels = JSON.parse(jsonMatch[1].trim());
      } catch (markdownError) {
        core.setFailed(
          `Failed to parse JSON even after extracting from markdown block: ${markdownError.message}\nRaw output: ${rawLabels}`
        );
        return;
      }
    } else {
      // If no markdown block, try to find a raw JSON array in the output.
      // The CLI may include debug/log lines (e.g. telemetry init, YOLO mode)
      // before the actual JSON response.
      const jsonArrayMatch = rawLabels.match(
        /\[\s*\{\s*"issue_number"[\s\S]*\}\s*\]/
      );
      if (jsonArrayMatch) {
        try {
          parsedLabels = JSON.parse(jsonArrayMatch[0]);
        } catch (extractError) {
          core.setFailed(
            `Found JSON-like content but failed to parse: ${extractError.message}\nRaw output: ${rawLabels}`
          );
          return;
        }
      } else {
        core.setFailed(
          `Output is not valid JSON and does not contain extractable JSON.\nRaw output: ${rawLabels}`
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
        `Skipping entry with no issue number: ${JSON.stringify(entry)}`
      );
      continue;
    }

    const labelsToAdd = entry.labels_to_add || [];
    labelsToAdd.push('status/bot-triaged');

    if (labelsToAdd.length > 0) {
      await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        labels: labelsToAdd,
      });

      try {
        const hasBug = labelsToAdd.includes('kind/bug');
        const hasFeature = labelsToAdd.includes('kind/feature') || labelsToAdd.includes('kind/enhancement');
        
        let issueTypeId = null;
        if (hasBug) {
          issueTypeId = 'IT_kwDOCaSVvs4BR7vP'; // Bug
        } else if (hasFeature) {
          issueTypeId = 'IT_kwDOCaSVvs4BR7vQ'; // Feature
        }

        if (issueTypeId) {
          const { data: issueData } = await github.rest.issues.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issueNumber,
          });
          
          if (issueData && issueData.node_id) {
            await github.graphql(`
              mutation($issueId: ID!, $issueTypeId: ID!) {
                updateIssue(input: {id: $issueId, issueTypeId: $issueTypeId}) {
                  issue {
                    id
                  }
                }
              }
            `, {
              issueId: issueData.node_id,
              issueTypeId: issueTypeId
            });
            core.info(`Successfully synced Issue Type for #${issueNumber}`);
          }
        }
      } catch (typeError) {
        core.warning(`Failed to sync Issue Type for #${issueNumber}: ${typeError.message}`);
      }

      const explanation = entry.explanation ? ` - ${entry.explanation}` : '';
      core.info(
        `Successfully added labels for #${issueNumber}: ${labelsToAdd.join(', ')}${explanation}`
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
        `No labels to add or remove for #${issueNumber}, leaving as is`
      );
    }
  }
};
