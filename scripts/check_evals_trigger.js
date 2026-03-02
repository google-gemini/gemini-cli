/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { execSync } from 'node:child_process';

const EVALS_FILE_PREFIXES = [
  'packages/core/src/prompts/',
  'packages/core/src/tools/',
];

function main() {
  try {
    // Fetch main branch to compare against. Use || true to avoid failing if already up to date or no remote.
    execSync('git fetch https://github.com/google-gemini/gemini-cli.git main', {
      stdio: 'ignore',
    });

    // Find the merge base with main
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
