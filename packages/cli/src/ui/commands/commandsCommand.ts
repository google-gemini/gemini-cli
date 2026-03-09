/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * Action for `/commands list`.
 * Displays all currently registered slash commands.
 */
async function listAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const commands = context.ui.slashCommands;
  if (!commands || commands.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No slash commands loaded.',
    };
  }

  const list = commands
    .map((cmd: SlashCommand) => `  - **/${cmd.name}**: ${cmd.description}`)
    .join('\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `Available Slash Commands:\n\n${list}`,
  };
}

/**
 * Action for the default `/commands` invocation.
 */
async function defaultAction(
  _context: CommandContext,
  _args: string,
): Promise<void | SlashCommandActionReturn> {
  return {
    type: 'message',
    messageType: 'info',
    content:
      'Usage: /commands [list|reload]',
  };
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
      description: 'List all currently registered slash commands.',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: listAction,
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
