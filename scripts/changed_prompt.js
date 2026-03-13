/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execSync } from 'node:child_process';

const EVALS_FILE_PREFIXES = [
  'packages/core/src/prompts/',
  'packages/core/src/tools/',
  'evals/',
];

function main() {
  const targetBranch = process.env.GITHUB_BASE_REF || 'main';
  try {
    const remoteUrl = process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}.git`
      : 'origin';

    // Fetch target branch from the remote.
    execSync(`git fetch ${remoteUrl} ${targetBranch}`, {
      stdio: 'ignore',
    });

    // Get changed files using the triple-dot syntax which correctly handles merge commits
    const changedFiles = execSync(`git diff --name-only FETCH_HEAD...HEAD`, {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    const shouldRun = changedFiles.some((file) =>
      EVALS_FILE_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );

    console.log(shouldRun ? 'true' : 'false');
  } catch (error) {
    // If anything fails (e.g., no git history), run evals to be safe
    console.warn(
      'Warning: Failed to determine if evals should run. Defaulting to true.',
    );
    console.error(error);
    console.log('true');
  }
}

main();
