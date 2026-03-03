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
    // Fetch target branch from origin.
    execSync(`git fetch origin ${targetBranch}`, {
      stdio: 'ignore',
    });

    // Find the merge base with the target branch.
    const mergeBase = execSync('git merge-base HEAD FETCH_HEAD', {
      encoding: 'utf-8',
    }).trim();

    // Get changed files
    const changedFiles = execSync(`git diff --name-only ${mergeBase} HEAD`, {
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
