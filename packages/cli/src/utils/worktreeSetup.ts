/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getProjectRootForWorktree,
  createWorktreeService,
  writeToStderr,
  type WorktreeInfo,
} from '@google/gemini-cli-core';
import { isIPCAvailable } from './processUtils.js';

const WORKTREE_ACK_TIMEOUT_MS = 500;

async function notifyWorktreeSelected(worktreePath: string): Promise<void> {
  if (!isIPCAvailable()) {
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const timeout = setTimeout(done, WORKTREE_ACK_TIMEOUT_MS);
    try {
      process.send!(
        {
          type: 'worktree-selected',
          path: worktreePath,
        },
        () => {
          clearTimeout(timeout);
          done();
        },
      );
    } catch {
      clearTimeout(timeout);
      done();
    }
  });
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

    await notifyWorktreeSelected(worktreeInfo.path);

    return worktreeInfo;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeToStderr(`Failed to create or switch to worktree: ${errorMessage}\n`);
    process.exit(1);
  }
}
