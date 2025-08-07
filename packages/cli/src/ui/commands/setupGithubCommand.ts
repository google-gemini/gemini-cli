/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';

import { CommandContext } from '../../ui/commands/types.js';
import {
  getGitRepoRoot,
  getLatestGitHubRelease,
  isGitHubRepository,
  getGitHubRepoInfo,
} from '../../utils/gitUtils.js';

import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { getUrlOpenCommand } from '../../ui/utils/commandUtils.js';

// Generate OS-specific commands to open the GitHub pages needed for setup.
function getOpenUrlsCommands(readmeUrl: string): string[] {
  // Determine the OS-specific command to open URLs, ex: 'open', 'xdg-open', etc
  const openCmd = getUrlOpenCommand();

  // Build a list of URLs to open
  const urlsToOpen = [readmeUrl];

  const repoInfo = getGitHubRepoInfo();
  if (repoInfo) {
    urlsToOpen.push(
      `https://github.com/${repoInfo.owner}/${repoInfo.repo}/settings/secrets/actions`,
    );
  }

  // Create and join the individual commands
  const commands = urlsToOpen.map((url) => `${openCmd} "${url}"`);
  return commands;
}

export const setupGithubCommand: SlashCommand = {
  name: 'setup-github',
  description: 'Set up GitHub Actions',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
    if (!isGitHubRepository()) {
      throw new Error(
        'Unable to determine the GitHub repository. /setup-github must be run from a git repository.',
      );
    }

    // Find the root directory of the repo
    let gitRepoRoot: string;
    try {
      gitRepoRoot = getGitRepoRoot();
    } catch (_error) {
      console.debug(`Failed to get git repo root:`, _error);
      throw new Error(
        'Unable to determine the GitHub repository. /setup-github must be run from a git repository.',
      );
    }

    // Get the latest release tag from GitHub
    const proxy = context?.services?.config?.getProxy();
    const releaseTag = await getLatestGitHubRelease(proxy);

    const workflows = [
      'gemini-cli/gemini-cli.yml',
      'issue-triage/gemini-issue-automated-triage.yml',
      'issue-triage/gemini-issue-scheduled-triage.yml',
      'pr-review/gemini-pr-review.yml',
    ];

    const commands = [];

    // Ensure fast exit
    commands.push(`set -eEuo pipefail`);

    // Make the directory if it doesn't exist
    commands.push(`mkdir -p "${gitRepoRoot}/.github/workflows"`);

    for (const workflow of workflows) {
      const fileName = path.basename(workflow);
      const curlCommand = buildCurlCommand(
        `https://raw.githubusercontent.com/google-github-actions/run-gemini-cli/refs/tags/${releaseTag}/examples/workflows/${workflow}`,
        [`--output "${gitRepoRoot}/.github/workflows/${fileName}"`],
      );
      commands.push(curlCommand);
    }

    const readmeUrl = `https://github.com/google-github-actions/run-gemini-cli/blob/${releaseTag}/README.md#quick-start`;

    commands.push(
      `echo "Successfully downloaded ${workflows.length} workflows. Follow the steps in ${readmeUrl} (skipping the /setup-github step) to complete setup."`,
    );

    commands.push(...getOpenUrlsCommands(readmeUrl));

    const command = `(${commands.join(' && ')})`;
    return {
      type: 'tool',
      toolName: 'run_shell_command',
      toolArgs: {
        description:
          'Setting up GitHub Actions to triage issues and review PRs with Gemini.',
        command,
      },
    };
  },
};

// buildCurlCommand is a helper for constructing a consistent curl command.
function buildCurlCommand(u: string, additionalArgs?: string[]): string {
  const args = [];
  args.push('--fail');
  args.push('--location');
  args.push('--show-error');
  args.push('--silent');

  for (const val of additionalArgs || []) {
    args.push(val);
  }

  args.sort();

  return `curl ${args.join(' ')} "${u}"`;
}
