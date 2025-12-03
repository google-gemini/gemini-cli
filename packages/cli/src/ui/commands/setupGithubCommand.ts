/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs';
import { Writable } from 'node:stream';
import { ProxyAgent } from 'undici';

import type { CommandContext } from '../../ui/commands/types.js';
import {
  getGitRepoRoot,
  getLatestGitHubRelease,
  isGitHubRepository,
  getGitHubRepoInfo,
} from '../../utils/gitUtils.js';

import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { getUrlOpenCommand } from '../../ui/utils/commandUtils.js';
import { debugLogger } from '@google/gemini-cli-core';

export const GITHUB_WORKFLOW_PATHS = [
  'gemini-dispatch/gemini-dispatch.yml',
  'gemini-assistant/gemini-invoke.yml',
  'issue-triage/gemini-triage.yml',
  'issue-triage/gemini-scheduled-triage.yml',
  'pr-review/gemini-review.yml',
];

export const GITHUB_COMMANDS_PATHS = [
  'gemini-assistant/gemini-invoke.toml',
  'issue-triage/gemini-scheduled-triage.toml',
  'issue-triage/gemini-triage.toml',
  'pr-review/gemini-review.toml',
];

const REPO_DOWNLOAD_URL =
  'https://raw.githubusercontent.com/google-github-actions/run-gemini-cli';
const SOURCE_DIR = 'examples/workflows';
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

// Add Gemini CLI specific entries to .gitignore file
export async function updateGitignore(gitRepoRoot: string): Promise<void> {
  const gitignoreEntries = ['.gemini/', 'gha-creds-*.json'];

  const gitignorePath = path.join(gitRepoRoot, '.gitignore');
  try {
    // Check if .gitignore exists and read its content
    let existingContent = '';
    let fileExists = true;
    try {
      existingContent = await fs.promises.readFile(gitignorePath, 'utf8');
    } catch (_error) {
      // File doesn't exist
      fileExists = false;
    }

    if (!fileExists) {
      // Create new .gitignore file with the entries
      const contentToWrite = gitignoreEntries.join('\n') + '\n';
      await fs.promises.writeFile(gitignorePath, contentToWrite);
    } else {
      // Check which entries are missing
      const missingEntries = gitignoreEntries.filter(
        (entry) =>
          !existingContent
            .split(/\r?\n/)
            .some((line) => line.split('#')[0].trim() === entry),
      );

      if (missingEntries.length > 0) {
        const contentToAdd = '\n' + missingEntries.join('\n') + '\n';
        await fs.promises.appendFile(gitignorePath, contentToAdd);
      }
    }
  } catch (error) {
    debugLogger.debug('Failed to update .gitignore:', error);
    // Continue without failing the whole command
  }
}

async function downloadFiles({
  paths,
  releaseTag,
  targetDir,
  proxy,
  abortController,
}: {
  paths: string[];
  releaseTag: string;
  targetDir: string;
  proxy: string | undefined;
  abortController: AbortController;
}): Promise<void> {
  const downloads = [];
  for (const fileBasename of paths) {
    downloads.push(
      (async () => {
        const endpoint = `${REPO_DOWNLOAD_URL}/refs/tags/${releaseTag}/${SOURCE_DIR}/${fileBasename}`;
        const response = await fetch(endpoint, {
          method: 'GET',
          dispatcher: proxy ? new ProxyAgent(proxy) : undefined,
          signal: AbortSignal.any([
            AbortSignal.timeout(30_000),
            abortController.signal,
          ]),
        } as RequestInit);

        if (!response.ok) {
          throw new Error(
            `Invalid response code downloading ${endpoint}: ${response.status} - ${response.statusText}`,
          );
        }
        const body = response.body;
        if (!body) {
          throw new Error(
            `Empty body while downloading ${endpoint}: ${response.status} - ${response.statusText}`,
          );
        }

        const destination = path.resolve(
          targetDir,
          path.basename(fileBasename),
        );

        const fileStream = fs.createWriteStream(destination, {
          mode: 0o644, // -rw-r--r--, user(rw), group(r), other(r)
          flags: 'w', // write and overwrite
          flush: true,
        });

        await body.pipeTo(Writable.toWeb(fileStream));
      })(),
    );
  }

  await Promise.all(downloads).finally(() => {
    abortController.abort();
  });
}

async function createDirectory(dirPath: string): Promise<void> {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (_error) {
    debugLogger.debug(`Failed to create ${dirPath} directory:`, _error);
    throw new Error(
      `Unable to create ${dirPath} directory. Do you have file permissions in the current directory?`,
    );
  }
}

async function downloadSetupFiles({
  configs,
  releaseTag,
  proxy,
}: {
  configs: Array<{ paths: string[]; targetDir: string }>;
  releaseTag: string;
  proxy: string | undefined;
}): Promise<void> {
  try {
    await Promise.all(
      configs.map(({ paths, targetDir }) => {
        const abortController = new AbortController();
        return downloadFiles({
          paths,
          releaseTag,
          targetDir,
          proxy,
          abortController,
        });
      }),
    );
  } catch (error) {
    debugLogger.debug('Failed to download required setup files: ', error);
    throw error;
  }
}

export const setupGithubCommand: SlashCommand = {
  name: 'setup-github',
  description: 'Set up GitHub Actions',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
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
      debugLogger.debug(`Failed to get git repo root:`, _error);
      throw new Error(
        'Unable to determine the GitHub repository. /setup-github must be run from a git repository.',
      );
    }

    // Get the latest release tag from GitHub
    const proxy = context?.services?.config?.getProxy();
    const releaseTag = await getLatestGitHubRelease(proxy);
    const readmeUrl = `https://github.com/google-github-actions/run-gemini-cli/blob/${releaseTag}/README.md#quick-start`;

    // Create workflows directory
    const workflowsDir = path.join(gitRepoRoot, '.github', 'workflows');
    await createDirectory(workflowsDir);

    // Create commands directory
    const commandsDir = path.join(gitRepoRoot, '.github', 'commands');
    await createDirectory(commandsDir);

    await downloadSetupFiles({
      configs: [
        { paths: GITHUB_WORKFLOW_PATHS, targetDir: workflowsDir },
        { paths: GITHUB_COMMANDS_PATHS, targetDir: commandsDir },
      ],
      releaseTag,
      proxy,
    });

    // Add entries to .gitignore file
    await updateGitignore(gitRepoRoot);

    // Print out a message
    const commands = [];
    if (process.platform !== 'win32') {
      commands.push('set -eEuo pipefail');
    }
    commands.push(
      `echo "Successfully downloaded ${GITHUB_WORKFLOW_PATHS.length} workflows , ${GITHUB_COMMANDS_PATHS.length} commands and updated .gitignore. Follow the steps in ${readmeUrl} (skipping the /setup-github step) to complete setup."`,
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
