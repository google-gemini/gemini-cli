/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { ProxyAgent } from 'undici';

/**
 * Checks if a directory is within a git repository hosted on GitHub.
 * @returns true if the directory is in a git repository with a github.com remote, false otherwise
 */
export const isGitHubRepository = (): boolean => {
  try {
    const remotes = (
      execSync('git remote -v', {
        encoding: 'utf-8',
      }) || ''
    ).trim();

    const pattern = /github\.com/;

    return pattern.test(remotes);
  } catch (_error) {
    // If any filesystem error occurs, assume not a git repo
    console.debug(`Failed to get git remote:`, _error);
    return false;
  }
};

/**
 * getGitRepoRoot returns the root directory of the git repository.
 * @returns the path to the root of the git repo.
 * @throws error if the exec command fails.
 */
export const getGitRepoRoot = (): string => {
  const gitRepoRoot = (
    execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
    }) || ''
  ).trim();

  if (!gitRepoRoot) {
    throw new Error(`Git repo returned empty value`);
  }

  return gitRepoRoot;
};

/**
 * getLatestGitHubRelease returns the release tag as a string.
 * @returns string of the release tag (e.g. "v1.2.3").
 */
export const getLatestGitHubRelease = async (
  proxy?: string,
): Promise<string> => {
  try {
    const controller = new AbortController();

    const endpoint = `https://api.github.com/repos/google-github-actions/run-gemini-cli/releases/latest`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      dispatcher: proxy ? new ProxyAgent(proxy) : undefined,
      signal: AbortSignal.any([AbortSignal.timeout(30_000), controller.signal]),
    } as RequestInit);

    if (!response.ok) {
      throw new Error(
        `Invalid response code: ${response.status} - ${response.statusText}`,
      );
    }

    const releaseTag = (await response.json()).tag_name;
    if (!releaseTag) {
      throw new Error(`Response did not include tag_name field`);
    }
    return releaseTag;
  } catch (_error) {
    console.debug(`Failed to determine latest run-gemini-cli release:`, _error);
    throw new Error(
      `Unable to determine the latest run-gemini-cli release on GitHub.`,
    );
  }
};

/**
 * getGitHubRepoInfo returns the owner and repository for a GitHub repo.
 * @returns the owner and repository of the github repo.
 * @throws error if the exec command fails.
 */
export function getGitHubRepoInfo(): { owner: string; repo: string } {
  const remoteUrl = execSync('git remote get-url origin', {
    encoding: 'utf-8',
  }).trim();

  // Matches either https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const match = remoteUrl.match(
    /(?:https?:\/\/|git@)github\.com(?::|\/)([^/]+)\/([^/]+?)(?:\.git)?$/,
  );

  // If the regex fails match, throw an error.
  if (!match || !match[1] || !match[2]) {
    throw new Error(
      `Owner & repo could not be extracted from remote URL: ${remoteUrl}`,
    );
  }

  return { owner: match[1], repo: match[2] };
}
