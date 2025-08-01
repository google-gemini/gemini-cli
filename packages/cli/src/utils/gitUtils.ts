/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';

/**
 * Checks if a directory is within a git repository hosted on GitHub.
 * @returns true if the directory is in a git repository with a github.com remote, false otherwise
 */
export function isGitHubRepository(): boolean {
  try {
    const remotes = execSync('git remote -v', {
      encoding: 'utf-8',
    });

    const pattern = /github\.com/;

    return pattern.test(remotes);
  } catch (_error) {
    // If any filesystem error occurs, assume not a git repo
    return false;
  }
}
