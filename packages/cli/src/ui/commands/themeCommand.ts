/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import {
  CommandKind,
  OpenDialogActionReturn,
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { listThemeFiles } from '@google/gemini-cli-core';
import { themeInstaller } from './installers/themeInstaller.js';

// /theme list  -> lists installed custom themes (from files)
// /theme install <marketplace-url> -> installs a VS Code theme

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'list installed custom themes',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<SlashCommandActionReturn> => {
    const files = await listThemeFiles();
    if (!files.length) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No custom theme files found. Use /theme install <marketplace-url> to add one.',
      } as const;
    }
    const lines = files.map((f: { name: string }) => `• ${f.name}`).join('\n');
    return {
      type: 'message',
      messageType: 'info',
      content: `Installed custom themes (file-based):\n${lines}\n\nUse /theme to open the theme picker dialog.`,
    } as const;
  },
};

const installSubCommand: SlashCommand = {
  name: 'install',
  description: 'install a VS Code theme from marketplace URL',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'submit_prompt',
        content: `Provide a VS Code marketplace URL to install a theme.\n\nUsage: /theme install <marketplace-url>\nExample: /theme install https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }
    return themeInstaller.run(context, args);
  },
};

import type { OpenDialogActionReturn, SlashCommand } from './types.js';
import { CommandKind } from './types.js';


export const themeCommand: SlashCommand = {
  name: 'theme',
  description: 'manage and select themes',
  kind: CommandKind.BUILT_IN,
  // Default action (no subcommand) opens the dialog
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'theme',
  }),
  subCommands: [listSubCommand, installSubCommand],
};
