/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isFolderTrustEnabled,
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
  batchAddDirectories,
} from '../utils/directoryUtils.js';
import type { Config } from '@google/gemini-cli-core';
import * as path from 'node:path';
import * as fs from 'node:fs';

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

  if (added.length > 0) {
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
  }

  if (added.length > 0) {
    const gemini = config.getGeminiClient();
    if (gemini) {
      await gemini.addDirectoryContext();

      // Persist directories to session file for resume support
      const chatRecordingService = gemini.getChatRecordingService();
      const workspaceContext = config.getWorkspaceContext();
      chatRecordingService?.recordDirectories(
        workspaceContext.getDirectories(),
      );
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

        // Filter out existing directories
        let filteredSuggestions = suggestions;
        if (context.services.config) {
          const workspaceContext =
            context.services.config.getWorkspaceContext();
          const existingDirs = new Set(
            workspaceContext.getDirectories().map((dir) => path.resolve(dir)),
          );

          filteredSuggestions = suggestions.filter((s) => {
            const expanded = expandHomeDir(s);
            const absolute = path.resolve(expanded);

            if (existingDirs.has(absolute)) {
              return false;
            }
            if (
              absolute.endsWith(path.sep) &&
              existingDirs.has(absolute.slice(0, -1))
            ) {
              return false;
            }
            return true;
          });
        }

        if (parts.length > 1) {
          const prefix = parts.slice(0, -1).join(',') + ',';
          return filteredSuggestions.map((s) => prefix + leadingWhitespace + s);
        }

        return filteredSuggestions.map((s) => leadingWhitespace + s);
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
          const trimmedPath = pathToAdd.trim();
          const expandedPath = expandHomeDir(trimmedPath);
          try {
            const absolutePath = path.resolve(
              workspaceContext.targetDir,
              expandedPath,
            );
            const resolvedPath = fs.realpathSync(absolutePath);
            if (currentWorkspaceDirs.includes(resolvedPath)) {
              alreadyAdded.push(trimmedPath);
              continue;
            }
          } catch (_e) {
            // Path might not exist or be inaccessible.
            // We'll let batchAddDirectories handle it later.
          }
          pathsToProcess.push(trimmedPath);
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

        if (isFolderTrustEnabled(settings.merged)) {
          const trustedFolders = loadTrustedFolders();
          const dirsToConfirm: string[] = [];
          const trustedDirs: string[] = [];

          for (const pathToAdd of pathsToProcess) {
            const expandedPath = path.resolve(expandHomeDir(pathToAdd.trim()));
            const isTrusted = trustedFolders.isPathTrusted(expandedPath);
            // If explicitly trusted, add immediately.
            // If undefined or explicitly untrusted (DO_NOT_TRUST), prompt for confirmation.
            // This allows users to "upgrade" a DO_NOT_TRUST folder to trusted via the dialog.
            if (isTrusted === true) {
              trustedDirs.push(pathToAdd.trim());
            } else {
              dirsToConfirm.push(pathToAdd.trim());
            }
          }

          if (trustedDirs.length > 0) {
            const result = batchAddDirectories(workspaceContext, trustedDirs);
            added.push(...result.added);
            errors.push(...result.errors);
          }

          if (dirsToConfirm.length > 0) {
            return {
              type: 'custom_dialog',
              component: (
                <MultiFolderTrustDialog
                  folders={dirsToConfirm}
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
          const result = batchAddDirectories(workspaceContext, pathsToProcess);
          added.push(...result.added);
          errors.push(...result.errors);
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
