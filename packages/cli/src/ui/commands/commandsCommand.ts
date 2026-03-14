/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { glob } from 'glob';
import { isNodeError, debugLogger } from '@google/gemini-cli-core';
import { FileCommandLoader } from '../../services/FileCommandLoader.js';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import {
  MessageType,
  type HistoryItemError,
  type HistoryItemInfo,
} from '../types.js';

/**
 * Action for the default `/commands` invocation.
 * Displays a message prompting the user to use a subcommand.
 */
async function defaultAction(
  _context: CommandContext,
  _args: string,
): Promise<void | SlashCommandActionReturn> {
  return {
    type: 'message',
    messageType: 'info',
    content:
      'Use "/commands list" to view available .toml files, or "/commands reload" to reload custom command definitions.',
  };
}

/**
 * Action for `/commands list`.
 * Lists available .toml command files from user, project, and extension directories.
 */
async function listSubcommandAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  try {
    const config = context.services.config;
    const loader = new FileCommandLoader(config);
    const directories = loader.getCommandDirectories();

    const results: string[] = [];
    for (const dir of directories) {
      try {
        const files = await glob('**/*.toml', { cwd: dir.path });
        if (files.length > 0) {
          const displayName =
            dir.kind === CommandKind.USER_FILE
              ? 'User'
              : dir.kind === CommandKind.WORKSPACE_FILE
                ? 'Project'
                : `Extension: ${dir.extensionName}`;

          results.push(`### ${displayName} Commands (${dir.path})`);
          files.forEach((file) => results.push(`- ${file}`));
        }
      } catch (e) {
        if (isNodeError(e) && e.code === 'ENOENT') {
          continue;
        }

        debugLogger.error(
          `[commands list] Error reading directory ${dir.path}:`,
          e,
        );

        const displayName =
          dir.kind === CommandKind.USER_FILE
            ? 'User'
            : dir.kind === CommandKind.WORKSPACE_FILE
              ? 'Project'
              : `Extension: ${dir.extensionName}`;

        results.push(`### ${displayName} Commands (${dir.path})`);
        results.push(
          `- (Error reading directory: ${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }

    results.push(
      '\n_Note: MCP prompts are dynamically loaded from configured MCP servers._',
    );

    if (results.length === 1) {
      // Only the note is present
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No custom command files (.toml) found.\n\n_Note: MCP prompts are dynamically loaded from configured MCP servers._',
      };
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: results.join('\n'),
      } as HistoryItemInfo,
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to list commands: ${error instanceof Error ? error.message : String(error)}`,
      } as HistoryItemError,
      Date.now(),
    );
  }
}

/**
 * Action for `/commands reload`.
 * Triggers a full re-discovery and reload of all slash commands, including
 * user/project-level .toml files, MCP prompts, and extension commands.
 */
async function reloadAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  try {
    context.ui.reloadCommands();

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Custom commands reloaded successfully.',
      } as HistoryItemInfo,
      Date.now(),
    );
  } catch (error) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to reload commands: ${error instanceof Error ? error.message : String(error)}`,
      } as HistoryItemError,
      Date.now(),
    );
  }
}

export const commandsCommand: SlashCommand = {
  name: 'commands',
  description: 'Manage custom slash commands. Usage: /commands [list|reload]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'list',
      description:
        'List available custom command .toml files. Usage: /commands list',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: listSubcommandAction,
    },
    {
      name: 'reload',
      altNames: ['refresh'],
      description:
        'Reload custom command definitions from .toml files. Usage: /commands reload',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: reloadAction,
    },
  ],
  action: defaultAction,
};
