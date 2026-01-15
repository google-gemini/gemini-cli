/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { checkForUpdates } from '../utils/updateCheck.js';
import { getInstallationInfo } from '../../utils/installationInfo.js';
import { spawnWrapper } from '../../utils/spawnWrapper.js';

export const updateCommand: SlashCommand = {
  name: 'update',
  description: 'Check for and install Gemini CLI updates',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
    try {
      // Check for available updates (force: true to bypass notification settings)
      const updateInfo = await checkForUpdates(context.services.settings, true);

      if (!updateInfo) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'You are already running the latest version of Gemini CLI.',
        };
      }

      // Get installation info to determine if update is possible
      const installationInfo = getInstallationInfo(
        process.cwd(),
        !(context.services.settings.merged.general?.enableAutoUpdate ?? true),
      );

      // Check if running in sandbox or via npx/bunx
      if (
        context.services.settings.merged.tools?.sandbox ||
        process.env['GEMINI_SANDBOX']
      ) {
        return {
          type: 'message',
          messageType: 'info',
          content: `${updateInfo.message}\nAutomatic update is not available in sandbox mode.`,
        };
      }

      if (installationInfo.updateMessage && !installationInfo.updateCommand) {
        return {
          type: 'message',
          messageType: 'info',
          content: `${updateInfo.message}\n${installationInfo.updateMessage}`,
        };
      }

      // If user has confirmed the update, proceed with installation
      if (context.overwriteConfirmed) {
        // For manual user-initiated updates, directly execute the update command
        // bypassing the background auto-update checks
        if (!installationInfo.updateCommand) {
          return {
            type: 'message',
            messageType: 'error',
            content:
              'Update command not available for your installation method.',
          };
        }

        const isNightly = updateInfo.update.latest.includes('nightly');
        const updateCmd = installationInfo.updateCommand.replace(
          '@latest',
          isNightly ? '@nightly' : `@${updateInfo.update.latest}`,
        );

        const updateProcess = spawnWrapper(updateCmd, {
          stdio: 'ignore',
          shell: true,
          detached: true,
        });
        updateProcess.unref();

        return {
          type: 'message',
          messageType: 'info',
          content: `Update initiated. The new version will be used on your next run.`,
        };
      }

      // Prompt user for confirmation
      return {
        type: 'confirm_action',
        prompt: `${updateInfo.message}\n\nDo you want to update now?`,
        originalInvocation: {
          raw: '/update',
        },
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
