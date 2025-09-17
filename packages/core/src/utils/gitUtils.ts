/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Checks if a directory is the root of a git repository
 * @param directory The directory to check
 * @returns true if the directory contains a .git folder/file, false otherwise
 */
export function isGitRepository(directory: string): boolean {
  try {
    const resolvedDir = path.resolve(directory);
    const gitDir = path.join(resolvedDir, '.git');

    // Check if .git exists directly in this directory (either as directory or file for worktrees)
    return fs.existsSync(gitDir);
  } catch (_error) {
    // If any filesystem error occurs, assume not a git repo
    return false;
  }
}

/**
 * Finds the root directory of a git repository by walking up the directory tree
 * @param directory Starting directory to search from
 * @returns The git repository root path, or null if not in a git repository
 */
export function findGitRoot(directory: string): string | null {
  try {
    let currentDir = path.resolve(directory);

    while (true) {
      const gitDir = path.join(currentDir, '.git');

      if (fs.existsSync(gitDir)) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);

      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    return null;
  } catch (_error) {
    return null;
  }
}
