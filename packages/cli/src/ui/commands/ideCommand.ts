/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  IdeClient,
  type File,
  logIdeConnection,
  IdeConnectionEvent,
  IdeConnectionType,
} from '@google/gemini-cli-core';
import { t } from '../../i18n/index.js';
import {
  getIdeInstaller,
  IDEConnectionStatus,
  ideContextStore,
  GEMINI_CLI_COMPANION_EXTENSION_NAME,
} from '@google/gemini-cli-core';
import path from 'node:path';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
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
        content: t('commands:ide.responses.connected', {
          name: ideClient.getDetectedIdeDisplayName(),
        }),
      };
    case IDEConnectionStatus.Connecting:
      return {
        messageType: 'info',
        content: t('commands:ide.responses.connecting'),
      };
    default: {
      let content = t('commands:ide.responses.disconnected');
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

      return `  - ${displayName}${file.isActive ? t('commands:ide.responses.active') : ''}`;
    })
    .join('\n');

  const infoMessage = t('commands:ide.responses.openFilesNote');

  return `${t('commands:ide.responses.openFilesTitle')}${fileList}\n${infoMessage}`;
}

async function getIdeStatusMessageWithFiles(ideClient: IdeClient): Promise<{
  messageType: 'info' | 'error';
  content: string;
}> {
  const connection = ideClient.getConnectionStatus();
  switch (connection.status) {
    case IDEConnectionStatus.Connected: {
      let content = t('commands:ide.responses.connected', {
        name: ideClient.getDetectedIdeDisplayName(),
      });
      const context = ideContextStore.get();
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
        content: t('commands:ide.responses.connecting'),
      };
    default: {
      let content = t('commands:ide.responses.disconnected');
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

async function setIdeModeAndSyncConnection(
  config: Config,
  value: boolean,
  options: { logToConsole?: boolean } = {},
): Promise<void> {
  config.setIdeMode(value);
  const ideClient = await IdeClient.getInstance();
  if (value) {
    await ideClient.connect(options);
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.SESSION));
  } else {
    await ideClient.disconnect();
  }
}

export const ideCommand = async (): Promise<SlashCommand> => {
  const ideClient = await IdeClient.getInstance();
  const currentIDE = ideClient.getCurrentIde();
  if (!currentIDE) {
    return {
      name: 'ide',
      description: 'Manage IDE integration',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      action: (): SlashCommandActionReturn =>
        ({
          type: 'message',
          messageType: 'error',
          content: t('commands:ide.responses.notSupported'),
        }) as const,
    };
  }

  const ideSlashCommand: SlashCommand = {
    name: 'ide',
    description: 'Manage IDE integration',
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    subCommands: [],
  };

  const statusCommand: SlashCommand = {
    name: 'status',
    description: 'Check status of IDE integration',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
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
    description: `Install required IDE companion for ${ideClient.getDetectedIdeDisplayName()}`,
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context) => {
      const installer = getIdeInstaller(currentIDE);
      if (!installer) {
        context.ui.addItem(
          {
            type: 'error',
            text: t('commands:ide.responses.noInstaller', {
              name: ideClient.getDetectedIdeDisplayName(),
              extension: GEMINI_CLI_COMPANION_EXTENSION_NAME,
            }),
          },
          Date.now(),
        );
        return;
      }

      context.ui.addItem(
        {
          type: 'info',
          text: t('commands:ide.responses.installing'),
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
      if (result.success) {
        context.services.settings.setValue(
          SettingScope.User,
          'ide.enabled',
          true,
        );
        // Poll for up to 5 seconds for the extension to activate.
        for (let i = 0; i < 10; i++) {
          await setIdeModeAndSyncConnection(context.services.config!, true, {
            logToConsole: false,
          });
          if (
            ideClient.getConnectionStatus().status ===
            IDEConnectionStatus.Connected
          ) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const { messageType, content } = getIdeStatusMessage(ideClient);
        if (messageType === 'error') {
          context.ui.addItem(
            {
              type: messageType,
              text: t('commands:ide.responses.autoEnableFailed'),
            },
            Date.now(),
          );
        } else {
          context.ui.addItem(
            {
              type: messageType,
              text: content,
            },
            Date.now(),
          );
        }
      }
    },
  };

  const enableCommand: SlashCommand = {
    name: 'enable',
    description: 'Enable IDE integration',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context: CommandContext) => {
      context.services.settings.setValue(
        SettingScope.User,
        'ide.enabled',
        true,
      );
      await setIdeModeAndSyncConnection(context.services.config!, true);
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
    description: 'Disable IDE integration',
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: async (context: CommandContext) => {
      context.services.settings.setValue(
        SettingScope.User,
        'ide.enabled',
        false,
      );
      await setIdeModeAndSyncConnection(context.services.config!, false);
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

  const { status } = ideClient.getConnectionStatus();
  const isConnected = status === IDEConnectionStatus.Connected;

  if (isConnected) {
    ideSlashCommand.subCommands = [statusCommand, disableCommand];
  } else {
    ideSlashCommand.subCommands = [
      enableCommand,
      statusCommand,
      installCommand,
    ];
  }

  return ideSlashCommand;
};
