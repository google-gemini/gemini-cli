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
import { loadSettings, type LoadedSettings } from '../config/settings.js';
import { registerCleanup } from './cleanup.js';

/**
 * Sets up a git worktree for parallel sessions.
 * Returns the reloaded settings for the new worktree directory.
 *
 * This function uses a guard (GEMINI_CLI_WORKTREE_HANDLED) to ensure that
 * when the CLI relaunches itself (e.g. for memory allocation), it doesn't
 * attempt to create a nested worktree.
 */
export async function setupWorktree(
  worktreeName: string | undefined,
  currentSettings: LoadedSettings,
): Promise<LoadedSettings> {
  if (process.env['GEMINI_CLI_WORKTREE_HANDLED']) {
    return currentSettings;
  }

  try {
    const projectRoot = await getProjectRootForWorktree(process.cwd());
    const service = await createWorktreeService(process.cwd());

    const worktreeInfo = await service.setup(worktreeName || undefined);

    process.chdir(worktreeInfo.path);
    process.env['GEMINI_CLI_WORKTREE_HANDLED'] = '1';
    process.env['GEMINI_CLI_WORKTREE_BASE_SHA'] = worktreeInfo.baseSha;

    // Reload settings for the new worktree to pick up any local GEMINI.md
    const newSettings = loadSettings(process.cwd());

    registerCleanup(async () => {
      const cleanedUp = await service.maybeCleanup(worktreeInfo);
      if (cleanedUp) {
        process.chdir(projectRoot);
      }
    });

    return newSettings;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeToStderr(`Failed to create or switch to worktree: ${errorMessage}\n`);
    process.exit(1);
  }
}
