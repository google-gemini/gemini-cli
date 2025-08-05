/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { execSync } from 'child_process';
import { isGitHubRepository } from '../../utils/gitUtils.js';

import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';

export const setupGithubCommand: SlashCommand = {
  name: 'setup-github',
  description: 'Set up GitHub Actions',
  kind: CommandKind.BUILT_IN,
  action: (): SlashCommandActionReturn => {
    const gitRootRepo = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
    }).trim();

    if (!isGitHubRepository()) {
      throw new Error('Unable to determine the Git root directory.');
    }

    const version = 'v0';
    const workflowBaseUrl = `https://raw.githubusercontent.com/google-github-actions/run-gemini-cli/refs/heads/${version}/examples/workflows/`;

    const workflows = [
      'gemini-cli/gemini-cli.yml',
      'issue-triage/gemini-issue-automated-triage.yml',
      'issue-triage/gemini-issue-scheduled-triage.yml',
      'pr-review/gemini-pr-review.yml',
    ];

    const command = [
      'set -e',
      `mkdir -p "${gitRootRepo}/.github/workflows"`,
      ...workflows.map((workflow) => {
        const fileName = path.basename(workflow);
        return `curl -fsSL -o "${gitRootRepo}/.github/workflows/${fileName}" "${workflowBaseUrl}/${workflow}"`;
      }),
      'echo "Workflows downloaded successfully."',
    ].join(' && ');
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
