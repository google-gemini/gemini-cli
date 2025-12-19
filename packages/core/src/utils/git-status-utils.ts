/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import type { Config } from '../config/config.js';
import { debugLogger } from './debugLogger.js';

export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  branch?: string;
  tracking?: string;
  ahead: number;
  behind: number;
}

/**
 * Gets the Git status for the repository at the target directory.
 * @param config The application configuration
 * @returns Git status information, or null if not in a Git repository
 */
export async function getGitStatus(config: Config): Promise<GitStatus | null> {
  const targetDir = config.getTargetDir();
  const git: SimpleGit = simpleGit(targetDir);

  try {
    // Check if we're in a Git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }

    // Get status
    const status: StatusResult = await git.status();

    return {
      isRepo: true,
      isClean: status.isClean(),
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
      branch: status.current ?? undefined,
      tracking: status.tracking ?? undefined,
      ahead: status.ahead,
      behind: status.behind,
    };
  } catch (e) {
    // If git status fails, we're likely not in a repo or git is not available
    debugLogger.error('Failed to get git status', e);
    return null;
  }
}
