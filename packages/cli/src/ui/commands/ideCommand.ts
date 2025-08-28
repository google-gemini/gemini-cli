/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IdeClient, File } from '@google/gemini-cli-core';
import {
  getIdeInstaller,
  IDEConnectionStatus,
  ideContext,
  getErrorMessage,
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

export const ideCommand: SlashCommand = {
  name: 'ide',
  description: 'Manage IDE integration',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const [action] = args.split(/\s+/);

    if (action === 'install' || action === 'install-extension') {
      const currentIde = context.services.config
        ?.getIdeClient()
        .getCurrentIde();
      const ideDisplayName = context.services.config
        ?.getIdeClient()
        .getDetectedIdeDisplayName();

      if (!currentIde) {
        return {
          type: 'message',
          messageType: 'error',
          content:
            'No IDE detected. Please ensure VSCode or JetBrains IDE is running.',
        };
      }

      const installer = getIdeInstaller(currentIde);

      try {
        const result = await installer?.install();

        if (result?.success) {
          return {
            type: 'message',
            messageType: 'info',
            content: result.message,
          };
        } else if (result) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to install ${ideDisplayName} extension: ${result.message || 'Unknown error'}`,
          };
        } else {
          return {
            type: 'message',
            messageType: 'error',
            content: `No installer available for ${ideDisplayName}`,
          };
        }
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to install ${ideDisplayName} extension: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        };
      }
    }

    if (action === 'status') {
      const ideClient = context.services.config?.getIdeClient();
      if (!ideClient) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Config not available.',
        };
      }
      const statusMessage = await getIdeStatusMessageWithFiles(ideClient);

      return {
        type: 'message',
        messageType: statusMessage.messageType,
        content: statusMessage.content,
      };
    }

    if (action === 'connect') {
      const ideClient = context.services.config?.getIdeClient();
      if (!ideClient) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Config not available.',
        };
      }
      const currentIde = ideClient.getCurrentIde();

      if (!currentIde) {
        return {
          type: 'message',
          messageType: 'error',
          content:
            'No IDE detected. Please ensure VSCode or JetBrains IDE is running.',
        };
      }

      const installer = getIdeInstaller(currentIde);
      if (!installer) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'IDE installer not available for this IDE.',
        };
      }
      // Try to connect directly first
      try {
        if (ideClient.connect) {
          await ideClient.connect();
        }
        await context.services.config?.setIdeModeAndSyncConnection(true);
        const { messageType, content } = getIdeStatusMessage(ideClient);
        return {
          type: 'message',
          messageType,
          content,
        };
      } catch (error) {
        // If connection fails directly, return the error
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to connect: ${getErrorMessage(error)}`,
        };
      }

      // Not installed, proceed with installation
      const result = await installer!.install();

      if (result.success) {
        context.services.settings.setValue(
          SettingScope.User,
          'ide.enabled',
          true,
        );

        // Poll for up to 5 seconds for the extension to activate.
        const ideClient2 = context.services.config?.getIdeClient();
        if (ideClient2) {
          for (let i = 0; i < 10; i++) {
            await context.services.config?.setIdeModeAndSyncConnection(true);
            if (
              ideClient2!.getConnectionStatus().status ===
              IDEConnectionStatus.Connected
            ) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          const { messageType, content } = getIdeStatusMessage(ideClient2!);
          if (messageType === 'error') {
            return {
              type: 'message',
              messageType: 'error',
              content:
                'Failed to automatically enable IDE integration. To fix this, run the CLI in a new terminal window.',
            };
          } else {
            return {
              type: 'message',
              messageType,
              content,
            };
          }
        }
      }

      return {
        type: 'message',
        messageType: result.success ? 'info' : 'error',
        content: result.message,
      };
    }

    if (action === 'enable') {
      context.services.settings.setValue(
        SettingScope.User,
        'ide.enabled',
        true,
      );
      await context.services.config?.setIdeModeAndSyncConnection(true);
      const ideClient = context.services.config?.getIdeClient();
      if (ideClient) {
        const { messageType, content } = getIdeStatusMessage(ideClient);
        return {
          type: 'message',
          messageType,
          content,
        };
      }
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      };
    }

    if (action === 'disable') {
      context.services.settings.setValue(
        SettingScope.User,
        'ide.enabled',
        false,
      );
      await context.services.config?.setIdeModeAndSyncConnection(false);
      const ideClient = context.services.config?.getIdeClient();
      if (ideClient) {
        const { messageType, content } = getIdeStatusMessage(ideClient);
        return {
          type: 'message',
          messageType,
          content,
        };
      }
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      };
    }

    // Default: Show status
    const ideClient = context.services.config?.getIdeClient();
    if (!ideClient) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      };
    }
    const statusMessage = await getIdeStatusMessageWithFiles(ideClient);

    return {
      type: 'message',
      messageType: statusMessage.messageType,
      content: statusMessage.content,
    };
  },
};
