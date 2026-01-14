/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
  loadTrustedFolders,
} from '../../config/trustedFolders.js';
import { MultiFolderTrustDialog } from '../components/MultiFolderTrustDialog.js';
import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItem } from '../types.js';
import { refreshServerHierarchicalMemory } from '@google/gemini-cli-core';
import {
  expandHomeDir,
  getDirectorySuggestions,
} from '../utils/directoryUtils.js';
import type { Config } from '@google/gemini-cli-core';

async function finishAddingDirectories(
  config: Config,
  addItem: (
    itemData: Omit<HistoryItem, 'id'>,
    baseTimestamp?: number,
  ) => number,
  added: string[],
  errors: string[],
) {
  if (!config) {
    addItem({
      type: MessageType.ERROR,
      text: 'Configuration is not available.',
    });
    return;
  }

  try {
    if (config.shouldLoadMemoryFromIncludeDirectories()) {
      await refreshServerHierarchicalMemory(config);
    }
    addItem({
      type: MessageType.INFO,
      text: `Successfully added GEMINI.md files from the following directories if there are:\n- ${added.join('\n- ')}`,
    });
  } catch (error) {
    errors.push(`Error refreshing memory: ${(error as Error).message}`);
  }

  if (added.length > 0) {
    const gemini = config.getGeminiClient();
    if (gemini) {
      await gemini.addDirectoryContext();
    }
    addItem({
      type: MessageType.INFO,
      text: `Successfully added directories:\n- ${added.join('\n- ')}`,
    });
  }

  if (errors.length > 0) {
    addItem({ type: MessageType.ERROR, text: errors.join('\n') });
  }
}

export const directoryCommand: SlashCommand = {
  name: 'directory',
  altNames: ['dir'],
  description: 'Manage workspace directories',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'add',
      description:
        'Add directories to the workspace. Use comma to separate multiple paths',
      kind: CommandKind.BUILT_IN,
      autoExecute: false,
      showCompletionLoading: false,
      completion: async (context: CommandContext, partialArg: string) => {
        // Support multiple paths separated by commas
        const parts = partialArg.split(',');
        const lastPart = parts[parts.length - 1];
        const leadingWhitespace = lastPart.match(/^\s*/)?.[0] ?? '';
        const trimmedLastPart = lastPart.trimStart();

        if (trimmedLastPart === '') {
          return [];
        }

        const suggestions = await getDirectorySuggestions(trimmedLastPart);

        if (parts.length > 1) {
          const prefix = parts.slice(0, -1).join(',') + ',';
          return suggestions.map((s) => prefix + leadingWhitespace + s);
        }

        return suggestions.map((s) => leadingWhitespace + s);
      },
      action: async (context: CommandContext, args: string) => {
        const {
          ui: { addItem },
          services: { config, settings },
        } = context;
        const [...rest] = args.split(' ');

        if (!config) {
          addItem({
            type: MessageType.ERROR,
            text: 'Configuration is not available.',
          });
          return;
        }

        if (config.isRestrictiveSandbox()) {
          return {
            type: 'message' as const,
            messageType: 'error' as const,
            content:
              'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.',
          };
        }

        const pathsToAdd = rest
          .join(' ')
          .split(',')
          .filter((p) => p);
        if (pathsToAdd.length === 0) {
          addItem({
            type: MessageType.ERROR,
            text: 'Please provide at least one path to add.',
          });
          return;
        }

        const added: string[] = [];
        const errors: string[] = [];
        const alreadyAdded: string[] = [];

        const workspaceContext = config.getWorkspaceContext();
        const currentWorkspaceDirs = workspaceContext.getDirectories();
        const pathsToProcess: string[] = [];

        for (const pathToAdd of pathsToAdd) {
          const expandedPath = expandHomeDir(pathToAdd.trim());
          if (currentWorkspaceDirs.includes(expandedPath)) {
            alreadyAdded.push(pathToAdd.trim());
          } else {
            pathsToProcess.push(pathToAdd.trim());
          }
        }

        if (alreadyAdded.length > 0) {
          addItem({
            type: MessageType.INFO,
            text: `The following directories are already in the workspace:\n- ${alreadyAdded.join(
              '\n- ',
            )}`,
          });
        }

        if (pathsToProcess.length === 0) {
          return;
        }

        if (
          isFolderTrustEnabled(settings.merged) &&
          isWorkspaceTrusted(settings.merged).isTrusted
        ) {
          const trustedFolders = loadTrustedFolders();
          const untrustedDirs: string[] = [];
          const undefinedTrustDirs: string[] = [];
          const trustedDirs: string[] = [];

          for (const pathToAdd of pathsToProcess) {
            const expandedPath = expandHomeDir(pathToAdd.trim());
            const isTrusted = trustedFolders.isPathTrusted(expandedPath);
            if (isTrusted === false) {
              untrustedDirs.push(pathToAdd.trim());
            } else if (isTrusted === undefined) {
              undefinedTrustDirs.push(pathToAdd.trim());
            } else {
              trustedDirs.push(pathToAdd.trim());
            }
          }

          if (untrustedDirs.length > 0) {
            errors.push(
              `The following directories are explicitly untrusted and cannot be added to a trusted workspace:\n- ${untrustedDirs.join(
                '\n- ',
              )}\nPlease use the permissions command to modify their trust level.`,
            );
          }

          for (const pathToAdd of trustedDirs) {
            try {
              workspaceContext.addDirectory(expandHomeDir(pathToAdd));
              added.push(pathToAdd);
            } catch (e) {
              const error = e as Error;
              errors.push(`Error adding '${pathToAdd}': ${error.message}`);
            }
          }

          if (undefinedTrustDirs.length > 0) {
            return {
              type: 'custom_dialog',
              component: (
                <MultiFolderTrustDialog
                  folders={undefinedTrustDirs}
                  onComplete={context.ui.removeComponent}
                  trustedDirs={added}
                  errors={errors}
                  finishAddingDirectories={finishAddingDirectories}
                  config={config}
                  addItem={addItem}
                />
              ),
            };
          }
        } else {
          for (const pathToAdd of pathsToProcess) {
            try {
              workspaceContext.addDirectory(expandHomeDir(pathToAdd.trim()));
              added.push(pathToAdd.trim());
            } catch (e) {
              const error = e as Error;
              errors.push(
                `Error adding '${pathToAdd.trim()}': ${error.message}`,
              );
            }
          }
        }

        await finishAddingDirectories(config, addItem, added, errors);
        return;
      },
    },
    {
      name: 'show',
      description: 'Show all directories in the workspace',
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) => {
        const {
          ui: { addItem },
          services: { config },
        } = context;
        if (!config) {
          addItem({
            type: MessageType.ERROR,
            text: 'Configuration is not available.',
          });
          return;
        }
        const workspaceContext = config.getWorkspaceContext();
        const directories = workspaceContext.getDirectories();
        const directoryList = directories.map((dir) => `- ${dir}`).join('\n');
        addItem({
          type: MessageType.INFO,
          text: `Current workspace directories:\n${directoryList}`,
        });
      },
    },
  ],
};
