/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { access } from 'node:fs/promises';
import {
  type Config,
  createWorktreeService,
  getProjectRootForWorktree,
  isGeminiWorktree,
  writeToStderr,
  WorktreeService,
  type WorktreeInfo,
} from '@google/gemini-cli-core';

let worktreeExitCleanupDone = false;

/**
 * Resets exit-cleanup guard state for tests (same idea as `resetCleanupForTesting`).
 */
export function resetWorktreeExitCleanupForTesting(): void {
  worktreeExitCleanupDone = false;
}

/**
 * Sets up a git worktree for parallel sessions.
 *
 * This function uses a guard (GEMINI_CLI_WORKTREE_HANDLED) to ensure that
 * when the CLI relaunches itself (e.g. for memory allocation), it doesn't
 * attempt to create a nested worktree.
 */
export async function setupWorktree(
  worktreeName: string | undefined,
): Promise<WorktreeInfo | undefined> {
  if (process.env['GEMINI_CLI_WORKTREE_HANDLED'] === '1') {
    return undefined;
  }

  try {
    const projectRoot = await getProjectRootForWorktree(process.cwd());
    const service = await createWorktreeService(projectRoot);

    const worktreeInfo = await service.setup(worktreeName || undefined);

    process.chdir(worktreeInfo.path);
    process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';

    return worktreeInfo;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeToStderr(`Failed to create or switch to worktree: ${errorMessage}\n`);
    process.exit(1);
  }
}

/**
 * Removes the Gemini-managed worktree and its branch on exit when the tree is
 * clean (no staged, unstaged, or untracked changes and HEAD matches baseSha).
 *
 * Safe-by-default: any git error or dirty state preserves the worktree. Runs
 * at most once per process (quit path and registered cleanup share the same
 * guard).
 *
 * @param config Active CLI configuration.
 * @returns True if the worktree was removed, false if preserved or not applicable.
 */
export async function cleanupWorktreeOnExit(config: Config): Promise<boolean> {
  if (worktreeExitCleanupDone) {
    return false;
  }
  const settings = config.getWorktreeSettings();
  if (!settings) {
    return false;
  }

  const projectRoot = await getProjectRootForWorktree(settings.path);
  if (!isGeminiWorktree(settings.path, projectRoot)) {
    return false;
  }

  worktreeExitCleanupDone = true;

  const previousCwd = process.cwd();
  try {
    try {
      process.chdir(projectRoot);
    } catch {
      // Best-effort unlock for `git worktree remove`; cleanup may still succeed.
    }

    const service = new WorktreeService(projectRoot);
    let removed = await service.maybeCleanup(settings);
    if (removed) {
      try {
        await access(settings.path);
        removed = false;
      } catch {
        config.markWorktreeRemoved();
      }
    }
    return removed;
  } finally {
    try {
      process.chdir(previousCwd);
    } catch {
      // Ignore restore failures (e.g. previousCwd was removed).
    }
  }
}
