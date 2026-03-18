/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { createWorktreeService } from '@google/gemini-cli-core';

/**
 * Slash command to switch the active session to a new Git worktree.
 * This allows users to isolate their current task without restarting the CLI.
 */
export const worktreeCommand: SlashCommand = {
  name: 'worktree',
  description: 'Switch to a new isolated Git worktree',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const { config, settings } = context.services;
    if (!config) return;

    if (!settings.merged.experimental?.worktrees) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'The /worktree command is only available when experimental.worktrees is enabled in your settings.',
      });
      return;
    }

    const worktreeName = args.trim() || undefined;

    try {
      const service = await createWorktreeService(process.cwd());

      // 1. If already in a worktree, try to clean up if it's not dirty
      const currentWorktree = config.getWorktreeSettings();
      if (currentWorktree) {
        await service.maybeCleanup(currentWorktree);
      }

      // 2. Create the new worktree (generates a name if undefined)
      const info = await service.setup(worktreeName);

      // 3. Switch process directory
      process.chdir(info.path);

      // 4. Update config (this triggers the WorkingDirectoryChanged event)
      config.switchToWorktree(info);

      context.ui.addItem({
        type: MessageType.INFO,
        text: `Switched to worktree: ${info.name}`,
      });
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to switch to worktree: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
