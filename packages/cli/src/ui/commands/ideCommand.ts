/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  IDEConnectionStatus,
  getIdeDisplayName,
  getIdeInstaller,
} from '@google/gemini-cli-core';
import {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { SettingScope } from '../../config/settings.js';

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getIdeModeFeature()) {
    return null;
  }
  const currentIDE = config.getIdeClient().getCurrentIde();
  if (!currentIDE) {
    return null;
  }

  const ideSlashCommand: SlashCommand = {
    name: 'ide',
    description: 'manage IDE integration',
    kind: CommandKind.BUILT_IN,
    subCommands: [],
  };

  const statusCommand: SlashCommand = {
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
  };

  const installCommand: SlashCommand = {
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
  };

  const enableCommand: SlashCommand = {
    name: 'enable',
    description: 'enable IDE integration',
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext) => {
      context.services.settings.setValue(SettingScope.User, 'ideMode', true);
      config.setIdeMode(true);
      config.setIdeClientConnected();
    },
  };

  const disableCommand: SlashCommand = {
    name: 'disable',
    description: 'disable IDE integration',
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext) => {
      context.services.settings.setValue(SettingScope.User, 'ideMode', false);
      config.setIdeMode(false);
      config.setIdeClientDisconnected();
    },
  };

  const ideModeEnabled = config.getIdeMode();
  if (ideModeEnabled) {
    ideSlashCommand.subCommands = [
      disableCommand,
      statusCommand,
      installCommand,
    ];
  } else {
    ideSlashCommand.subCommands = [
      enableCommand,
      statusCommand,
      installCommand,
    ];
  }

  return ideSlashCommand;
};
