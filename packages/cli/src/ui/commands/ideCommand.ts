/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  getIdeDisplayName,
  getIdeInstaller,
  IDEConnectionStatus,
} from '@google/gemini-cli-core';
import {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getIdeMode()) {
    return null;
  }
  const currentIDE = config.getIdeClient().getCurrentIde();
  if (!currentIDE) {
    throw new Error(
      'IDE slash command should not be available if not running in an IDE',
    );
  }

  return {
    name: 'ide',
    description: 'manage IDE integration',
    kind: CommandKind.BUILT_IN,
    subCommands: [
      {
        name: 'status',
        description: 'check status of IDE integration',
        kind: CommandKind.BUILT_IN,
        action: (_context: CommandContext): SlashCommandActionReturn => {
          const connection = config.getIdeClient().getConnectionStatus();
          switch (connection?.status) {
            case IDEConnectionStatus.Connected:
              return {
                type: 'message',
                messageType: 'info',
                content: `🟢 Connected`,
              } as const;
            case IDEConnectionStatus.Connecting:
              return {
                type: 'message',
                messageType: 'info',
                content: `🟡 Connecting...`,
              } as const;
            default: {
              let content = `🔴 Disconnected`;
              if (connection?.details) {
                content += `: ${connection.details}`;
              }
              return {
                type: 'message',
                messageType: 'error',
                content,
              } as const;
            }
          }
        },
      },
      {
        name: 'install',
        description: `install required IDE companion ${getIdeDisplayName(currentIDE)} extension `,
        kind: CommandKind.BUILT_IN,
        action: async (context) => {
          const installer = getIdeInstaller(currentIDE);
          if (!installer) {
            context.ui.addItem(
              {
                type: 'error',
                text: 'No installer available for your configured IDE.',
              },
              Date.now(),
            );
            return;
          }

          context.ui.addItem(
            {
              type: 'info',
              text: `Installing IDE companion extension...`,
            },
            Date.now(),
          );

          const result = await installer.install();
          context.ui.addItem(
            {
              type: result.success ? 'info' : 'error',
              text: result.message,
            },
            Date.now(),
          );
        },
      },
    ],
  };
};
