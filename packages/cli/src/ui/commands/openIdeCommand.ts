/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { CommandKind } from './types.js';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';

/**
 * Opens the current working directory in the configured IDE.
 * Uses the user-configured IDE path from settings.
 */
function openConfiguredIde(
  idePath: string,
  workingDirectory: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    // Parse the IDE path - it might include arguments
    const parts = idePath.trim().split(/\s+/);
    const command = parts[0];
    const args = [...parts.slice(1), workingDirectory];

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    child.on('error', () => {
      resolve(false);
    });

    child.on('spawn', () => {
      resolve(true);
    });

    // Fallback timeout
    setTimeout(() => {
      resolve(true);
    }, 1000);
  });
}

export const openIdeCommand: SlashCommand = {
  name: 'open-ide',
  description: 'Open current directory in configured IDE',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
    const workingDirectory =
      context.services.config?.getWorkingDir() || process.cwd();

    // Get the configured IDE path from settings
    const idePath = context.services.settings.merged.ide?.defaultIdePath as
      | string
      | undefined;

    if (!idePath || idePath.trim() === '') {
      return {
        type: 'message',
        messageType: 'error',
        content:
          `No default IDE configured. Please set the IDE path in your settings.json file:\n\n` +
          `Add the following to your settings.json:\n` +
          `{\n` +
          `  "ide": {\n` +
          `    "defaultIdePath": "your-ide-command"\n` +
          `  }\n` +
          `}\n\n` +
          `Examples:\n` +
          `  - VS Code: "code"\n` +
          `  - VS Code Insiders: "code-insiders"\n` +
          `  - Sublime Text: "subl"\n` +
          `  - Vim: "vim"\n` +
          `  - Custom path: "/usr/bin/myeditor"`,
      } as const;
    }

    try {
      const success = await openConfiguredIde(idePath, workingDirectory);

      if (success) {
        return {
          type: 'message',
          messageType: 'info',
          content: `Opening "${workingDirectory}" in ${idePath}...`,
        } as const;
      } else {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to open IDE with command "${idePath}". Please check that the IDE path is correct in your settings.`,
        } as const;
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error opening IDE: ${error instanceof Error ? error.message : 'Unknown error'}`,
      } as const;
    }
  },
};
