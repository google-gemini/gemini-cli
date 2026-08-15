/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnAsync } from './shell-utils.js';

export function getSafeGitEnv(
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const devNullPath = process.platform === 'win32' ? 'NUL' : '/dev/null';

  // Strip pre-existing GIT_CONFIG_* and GIT_CONFIG_PARAMETERS variables to prevent environment pollution
  const cleanedEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (!key.startsWith('GIT_CONFIG_') && key !== 'GIT_CONFIG_PARAMETERS') {
      cleanedEnv[key] = value;
    }
  }

  return {
    ...cleanedEnv,
    GIT_CONFIG_GLOBAL: devNullPath,
    GIT_CONFIG_SYSTEM: devNullPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '8',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: '',
    GIT_CONFIG_KEY_2: 'core.hooksPath',
    GIT_CONFIG_VALUE_2: '',
    GIT_CONFIG_KEY_3: 'core.sshCommand',
    GIT_CONFIG_VALUE_3: '',
    GIT_CONFIG_KEY_4: 'core.pager',
    GIT_CONFIG_VALUE_4: 'cat',
    GIT_CONFIG_KEY_5: 'core.editor',
    GIT_CONFIG_VALUE_5: '',
    GIT_CONFIG_KEY_6: 'sequence.editor',
    GIT_CONFIG_VALUE_6: '',
    GIT_CONFIG_KEY_7: 'diff.external',
    GIT_CONFIG_VALUE_7: '',
  };
}

/**
 * Gets the absolute path to the git directory (.git) for the given working directory.
 * This handles standard git repositories, subdirectories, and worktrees.
 */
export async function getAbsoluteGitDir(cwd: string): Promise<string> {
  const result = await spawnAsync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd,
    env: getSafeGitEnv(),
  });
  return result.stdout.trim();
}

/**
 * Checks if a directory is within a git repository
 * @param directory The directory to check
 * @returns true if the directory is in a git repository, false otherwise
 */
export function isGitRepository(directory: string): boolean {
  try {
    let currentDir = path.resolve(directory);

    while (true) {
      const gitDir = path.join(currentDir, '.git');

      // Check if .git exists (either as directory or file for worktrees)
      if (fs.existsSync(gitDir)) {
        return true;
      }

      const parentDir = path.dirname(currentDir);

      // If we've reached the root directory, stop searching
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    return false;
  } catch {
    // If any filesystem error occurs, assume not a git repo
    return false;
  }
}

/**
 * Finds the root directory of a git repository
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
  } catch {
    return null;
  }
}
