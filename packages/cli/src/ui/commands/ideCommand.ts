/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  DetectedIde,
  GEMINI_CLI_COMPANION_EXTENSION_NAME,
  IDEConnectionStatus,
  getIdeInfo,
  getIdeInstaller,
  IdeClient,
  type File,
  ideContext,
} from '@google/gemini-cli-core';
import path from 'node:path';
import {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { SettingScope } from '../../config/settings.js';

function getIdeStatusMessage(ideClient: IdeClient): {
  messageType: 'info' | 'error';
  content: string;
} {
  const connection = ideClient.getConnectionStatus();
  switch (connection.status) {
    case IDEConnectionStatus.Connected:
      return {
        messageType: 'info',
        content: `🟢 Connected to ${ideClient.getDetectedIdeDisplayName()}`,
      };
    case IDEConnectionStatus.Connecting:
      return {
        messageType: 'info',
        content: `🟡 Connecting...`,
      };
    default: {
      let content = `🔴 Disconnected`;
      if (connection?.details) {
        content += `: ${connection.details}`;
      }
      return {
        messageType: 'error',
        content,
      };
    }
  }
}

function formatFileList(openFiles: File[]): string {
  const basenameCounts = new Map<string, number>();
  for (const file of openFiles) {
    const basename = path.basename(file.path);
    basenameCounts.set(basename, (basenameCounts.get(basename) || 0) + 1);
  }

  const fileList = openFiles
    .map((file: File) => {
      const basename = path.basename(file.path);
      const isDuplicate = (basenameCounts.get(basename) || 0) > 1;
      const parentDir = path.basename(path.dirname(file.path));
      const displayName = isDuplicate
        ? `${basename} (/${parentDir})`
        : basename;

      return `  - ${displayName}${file.isActive ? ' (active)' : ''}`;
    })
    .join('\n');

  const infoMessage = `
(Note: The file list is limited to a number of recently accessed files within your workspace and only includes local files on disk)`;

  return `\n\nOpen files:\n${fileList}\n${infoMessage}`;
}

async function getIdeStatusMessageWithFiles(ideClient: IdeClient): Promise<{
  messageType: 'info' | 'error';
  content: string;
}> {
  const connection = ideClient.getConnectionStatus();
  switch (connection.status) {
    case IDEConnectionStatus.Connected: {
      let content = `🟢 Connected to ${ideClient.getDetectedIdeDisplayName()}`;
      const context = ideContext.getIdeContext();
      const openFiles = context?.workspaceState?.openFiles;
      if (openFiles && openFiles.length > 0) {
        content += formatFileList(openFiles);
      }
      return {
        messageType: 'info',
        content,
      };
    }
    case IDEConnectionStatus.Connecting:
      return {
        messageType: 'info',
        content: `🟡 Connecting...`,
      };
    default: {
      let content = `🔴 Disconnected`;
      if (connection?.details) {
        content += `: ${connection.details}`;
      }
      return {
        messageType: 'error',
        content,
      };
    }
  }
}

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config) {
    return null;
  }
  const ideClient = config.getIdeClient();
  const currentIDE = ideClient.getCurrentIde();
  if (!currentIDE || !ideClient.getDetectedIdeDisplayName()) {
    return {
      name: 'ide',
      description: 'manage IDE integration',
      kind: CommandKind.BUILT_IN,
      action: (): SlashCommandActionReturn =>
        ({
          type: 'message',
          messageType: 'error',
          content: `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: ${Object.values(
            DetectedIde,
          )
            .map((ide) => getIdeInfo(ide).displayName)
            .join(', ')}`,
        }) as const,
    };
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
    action: async (): Promise<SlashCommandActionReturn> => {
      const { messageType, content } =
        await getIdeStatusMessageWithFiles(ideClient);
      return {
        type: 'message',
        messageType,
        content,
      } as const;
    },
  };

  const installCommand: SlashCommand = {
    name: 'install',
    description: `install required IDE companion for ${ideClient.getDetectedIdeDisplayName()}`,
    kind: CommandKind.BUILT_IN,
    action: async (context) => {
      const installer = getIdeInstaller(currentIDE);
      if (!installer) {
        context.ui.addItem(
          {
            type: 'error',
            text: `No installer is available for ${ideClient.getDetectedIdeDisplayName()}. Please install the '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' extension manually from the marketplace.`,
          },
          Date.now(),
        );
        return;
      }

      context.ui.addItem(
        {
          type: 'info',
          text: `Installing IDE companion...`,
        },
        Date.now(),
      );

      const result = await installer.install();
      if (result.success) {
        config.setIdeMode(true);
        context.services.settings.setValue(SettingScope.User, 'ideMode', true);
      }
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
      await config.setIdeModeAndSyncConnection(true);
      const { messageType, content } = getIdeStatusMessage(ideClient);
      context.ui.addItem(
        {
          type: messageType,
          text: content,
        },
        Date.now(),
      );
    },
  };

  const disableCommand: SlashCommand = {
    name: 'disable',
    description: 'disable IDE integration',
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext) => {
      context.services.settings.setValue(SettingScope.User, 'ideMode', false);
      await config.setIdeModeAndSyncConnection(false);
      const { messageType, content } = getIdeStatusMessage(ideClient);
      context.ui.addItem(
        {
          type: messageType,
          text: content,
        },
        Date.now(),
      );
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
