/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import type { Config } from '../config/config.js';
import { debugLogger } from './debugLogger.js';
import { getGitStatus } from './git-status-utils.js';

export interface GitDiffOptions {
  /** If true, show only staged changes. If false, show unstaged changes. If undefined, show all changes. */
  staged?: boolean;
  /** Specific file paths to diff. If empty/undefined, diff all files. */
  paths?: string[];
}

export interface GitDiffResult {
  diff: string;
  hasChanges: boolean;
}

export interface GitFileLists {
  staged: string[];
  unstaged: string[];
}

/**
 * Gets the lists of staged and unstaged files for diff operations.
 * @param config The application configuration
 * @returns File lists, or null if not in a Git repository
 */
export async function getGitFileLists(
  config: Config,
): Promise<GitFileLists | null> {
  const gitStatus = await getGitStatus(config);
  if (!gitStatus) {
    return null;
  }
  return {
    staged: gitStatus.staged,
    unstaged: gitStatus.unstaged,
  };
}

/**
 * Gets the Git diff for the repository at the target directory.
 * @param config The application configuration
 * @param options Options to control what diff to show
 * @returns Git diff information, or null if not in a Git repository
 */
export async function getGitDiff(
  config: Config,
  options: GitDiffOptions = {},
): Promise<GitDiffResult | null> {
  const targetDir = config.getTargetDir();
  const git: SimpleGit = simpleGit(targetDir);

  try {
    // Check if we're in a Git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }

    let diff: string;

    if (options.staged === true) {
      // Show only staged changes
      diff = await git.diff(['--staged', ...(options.paths || [])]);
    } else if (options.staged === false) {
      // Show only unstaged changes
      diff = await git.diff([...(options.paths || [])]);
    } else {
      // Show all changes (both staged and unstaged)
      diff = await git.diff(['HEAD', ...(options.paths || [])]);
    }

    return {
      diff,
      hasChanges: diff.length > 0,
    };
  } catch (e) {
    debugLogger.error('Failed to get git diff', e);
    return null;
  }
}
