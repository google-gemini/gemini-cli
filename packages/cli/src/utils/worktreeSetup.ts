/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getProjectRootForWorktree,
  createWorktreeService,
  writeToStderr,
} from '@google/gemini-cli-core';
import { registerCleanup } from './cleanup.js';

/**
 * Sets up a git worktree for parallel sessions.
 *
 * This function uses a guard (GEMINI_CLI_WORKTREE_HANDLED) to ensure that
 * when the CLI relaunches itself (e.g. for memory allocation), it doesn't
 * attempt to create a nested worktree.
 */
export async function setupWorktree(
  worktreeName: string | undefined,
): Promise<void> {
  if (process.env['GEMINI_CLI_WORKTREE_HANDLED'] === '1') {
    return;
  }

  try {
    const projectRoot = await getProjectRootForWorktree(process.cwd());
    const service = await createWorktreeService(projectRoot);

    const worktreeInfo = await service.setup(worktreeName || undefined);

    process.chdir(worktreeInfo.path);
    process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';
    process.env['GEMINI_CLI_WORKTREE_BASE_SHA'] = worktreeInfo.baseSha;

    registerCleanup(async () => {
      const cleanedUp = await service.maybeCleanup(worktreeInfo);
      if (cleanedUp) {
        process.chdir(projectRoot);
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeToStderr(`Failed to create or switch to worktree: ${errorMessage}\n`);
    process.exit(1);
  }
}
