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
import { MessageType } from '../types.js';
import { refreshServerHierarchicalMemory } from '@google/gemini-cli-core';
import { expandHomeDir } from '../utils/directoryUtils.js';

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
      action: async (context: CommandContext, args: string) => {
        const {
          ui: { addItem },
          services: { config, settings },
        } = context;
        const [...rest] = args.split(' ');

        if (!config) {
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Configuration is not available.',
            },
            Date.now(),
          );
          return;
        }

        const workspaceContext = config.getWorkspaceContext();

        const pathsToAdd = rest
          .join(' ')
          .split(',')
          .filter((p) => p);
        if (pathsToAdd.length === 0) {
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Please provide at least one path to add.',
            },
            Date.now(),
          );
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

        const added: string[] = [];
        const errors: string[] = [];

        if (
          isFolderTrustEnabled(settings.merged) &&
          isWorkspaceTrusted(settings.merged).isTrusted
        ) {
          const trustedFolders = loadTrustedFolders();
          const untrustedDirs: string[] = [];
          const undefinedTrustDirs: string[] = [];
          const trustedDirs: string[] = [];

          for (const pathToAdd of pathsToAdd) {
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
                  settings={settings}
                  addItem={addItem}
                  setGeminiMdFileCount={context.ui.setGeminiMdFileCount}
                  silentOnSuccess={false}
                />
              ),
            };
          }
        } else {
          for (const pathToAdd of pathsToAdd) {
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

        await finishAddingDirectories(
          config,
          settings,
          addItem,
          context.ui.setGeminiMdFileCount,
          added,
          errors,
          false,
        );
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
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Configuration is not available.',
            },
            Date.now(),
          );
          return;
        }
        const workspaceContext = config.getWorkspaceContext();
        const directories = workspaceContext.getDirectories();
        const directoryList = directories.map((dir) => `- ${dir}`).join('\n');
        addItem(
          {
            type: MessageType.INFO,
            text: `Current workspace directories:\n${directoryList}`,
          },
          Date.now(),
        );
      },
    },
  ],
};
