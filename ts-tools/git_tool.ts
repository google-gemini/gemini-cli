// ts-tools/git_tool.ts

import { runShellCommand } from './utils'; // Assuming a utility for shell commands exists
import { callGeminiApi } from './gemini'; // Assuming a utility for API calls exists

/**
 * @description A tool for enhanced Git operations using AI.
 * @param {string[]} args - The arguments for the git tool. e.g., ['commit-message']
 * @returns {Promise<string>} The output of the git tool.
 */
export async function gitTool(args: string[]): Promise<string> {
  const subCommand = args[0];

  if (!subCommand) {
    return Promise.reject(
      'Error: No subcommand provided to git_tool. Try "commit-message".'
    );
  }

  switch (subCommand) {
    case 'commit-message':
      return generateCommitMessage();
    default:
      return Promise.reject(`Error: Unknown git_tool subcommand "${subCommand}".`);
  }
}

/**
 * @description Generates a conventional commit message based on staged Git changes.
 * @returns {Promise<string>} A formatted commit message.
 */
async function generateCommitMessage(): Promise<string> {
  // Step 1: Execute 'git diff --staged' to get the changes.
  // The '--staged' flag ensures we only see changes that are ready to be committed.
  const diffResult = await runShellCommand('git', ['diff', '--staged']);

  if (diffResult.stderr) {
    // Handle cases where git command fails (e.g., not a git repo).
    return Promise.reject(`Error running git diff: ${diffResult.stderr}`);
  }

  const stagedDiff = diffResult.stdout.trim();

  // Step 2: Check if there are any staged changes.
  if (!stagedDiff) {
    return 'No changes are staged for commit. Use "git add" to stage your changes.';
  }

  // Step 3: Construct the prompt for the Gemini API.
  // This prompt provides context and clear instructions for the desired output format.
  const prompt = `
    Based on the following git diff, please generate a concise and descriptive commit message that follows the Conventional Commits specification.

    The commit message should have a subject line of 50 characters or less, and a body that explains the "what" and "why" of the changes.

    Example format:
    feat: Allow provided config object to extend other configs
    <-- empty line -->
    The new "extends" property in the config object allows you to inherit and override settings from a base configuration file. This simplifies managing multiple similar configurations.

    Here is the diff:
    ---
    ${stagedDiff}
    ---
  `;

  // Step 4: Call the Gemini API to generate the message.
  try {
    const commitMessage = await callGeminiApi(prompt);
    return `Suggested Commit Message:\n\n${commitMessage}`;
  } catch (error) {
    return Promise.reject(`Failed to generate commit message: ${error}`);
  }
}
