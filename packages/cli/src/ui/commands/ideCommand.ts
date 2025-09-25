/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdeClient } from '@google/gemini-cli-core';
import type {
  OpenDialogActionReturn,
  SlashCommand,
  MessageActionReturn,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

export const ideCommand = async (): Promise<SlashCommand> => {
  const ideClient = await IdeClient.getInstance();
  const currentIDE = ideClient.getCurrentIde();
  if (!currentIDE) {
    return {
      name: 'ide',
      description: 'manage IDE integration',
      kind: CommandKind.BUILT_IN,
      action: (): SlashCommandActionReturn =>
        ({
          type: 'message',
          messageType: 'error',
          content: `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: VS Code or VS Code forks.`,
        }) as const,
    };
  }

  const ideSlashCommand: SlashCommand = {
    name: 'ide',
    description: 'manage IDE integration and editor preference',
    kind: CommandKind.BUILT_IN,
    subCommands: [],
  };

  const integrationCommand: SlashCommand = {
    name: 'integration',
    description: 'manage settings for native IDE integration',
    kind: CommandKind.BUILT_IN,
    action: (): OpenDialogActionReturn | MessageActionReturn => {
      if (!currentIDE || !ideClient.getDetectedIdeDisplayName()) {
        return {
          type: 'message',
          messageType: 'error',
          content: `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: VS Code or VS Code forks.`,
        } as const;
      }

      return {
        type: 'dialog',
        dialog: 'ide-integration',
      } as const;
    },
  };

  const editorCommand: SlashCommand = {
    name: 'editor',
    description: 'set the editor for basic diff viewing and editing',
    kind: CommandKind.BUILT_IN,
    action: (): OpenDialogActionReturn => ({
      type: 'dialog',
      dialog: 'editor',
    }),
  };

  ideSlashCommand.subCommands = [integrationCommand, editorCommand];

  return ideSlashCommand;
};
