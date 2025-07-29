/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getErrorMessage,
  ImportNode,
  loadServerHierarchicalMemory,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';

function renderTree(node: ImportNode, indent = ''): string {
  let output = `${indent}└─ ${node.path}\n`;
  node.children.forEach((child: ImportNode, index: number) => {
    const isLast = index === node.children.length - 1;
    output += renderTree(child, indent + (isLast ? '    ' : '│   '));
  });
  return output;
}

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Commands for interacting with memory.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'show',
      description: 'Show the current memory contents and import tree.',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const sources = context.services.config?.getImportTrees() || [];

        let messageContent = '';

        if (sources.length > 0) {
          messageContent += `Memory loaded from ${sources.length} source file(s):\n\n`;
          sources.forEach((source) => {
            if (source.importTree) {
              messageContent += `${source.filePath}\n`;
              source.importTree.children.forEach((child) => {
                messageContent += renderTree(child, '');
              });
              messageContent += '\n';
            }
          });
        }

        if (memoryContent.length > 0) {
          messageContent += `Current combined memory content:\n\n---\n${memoryContent}\n---`;
        } else {
          messageContent = 'Memory is currently empty.';
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: 'Add content to the memory.',
      kind: CommandKind.BUILT_IN,
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /memory add <text to remember>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to save to memory: "${args.trim()}"`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'save_memory',
          toolArgs: { fact: args.trim() },
        };
      },
    },
    {
      name: 'refresh',
      description: 'Refresh the memory from the source.',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Refreshing memory from source files...',
          },
          Date.now(),
        );

        try {
          const config = await context.services.config;
          if (config) {
            const { memoryContent, fileCount, sources } =
              await loadServerHierarchicalMemory(
                config.getWorkingDir(),
                config.getDebugMode(),
                config.getFileService(),
                config.getExtensionContextFilePaths(),
                config.getFileFilteringOptions(),
                context.services.settings.merged.memoryDiscoveryMaxDirs,
              );
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);
            config.setImportTrees(sources);

            const successMessage =
              memoryContent.length > 0
                ? `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
                : 'Memory refreshed successfully. No memory content found.';

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error refreshing memory: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};
