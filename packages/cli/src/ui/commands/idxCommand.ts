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
import type {
  ToolActionReturn,
  MessageActionReturn,
} from '@google/gemini-cli-core';

const initSubCommand: SlashCommand = {
  name: 'init',
  description: 'Index the current project into .gemini/gemini.idx',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context: CommandContext): Promise<ToolActionReturn> => ({
    type: 'tool',
    toolName: 'graph_init',
    toolArgs: {},
  }),
};

const querySubCommand: SlashCommand = {
  name: 'query',
  description: 'Query the code graph for a function or class by name',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<ToolActionReturn | MessageActionReturn> => {
    const search = args?.trim();
    if (!search) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /idx query <name>',
      };
    }
    return {
      type: 'tool',
      toolName: 'graph_query',
      toolArgs: { search },
    };
  },
};

export const idxCommand: SlashCommand = {
  name: 'idx',
  description:
    'Index the codebase or query the code graph. /idx to index, /idx query <name> to search.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: [initSubCommand, querySubCommand],
  action: async (
    _context: CommandContext,
    args?: string,
  ): Promise<SlashCommandActionReturn> => {
    // Default action (bare /idx) runs graph_init
    const subCommand = args?.trim();
    if (!subCommand) {
      return {
        type: 'tool',
        toolName: 'graph_init',
        toolArgs: {},
      };
    }

    // Handle /idx query <name> typed directly
    if (subCommand.startsWith('query ')) {
      const search = subCommand.replace('query ', '').trim();
      if (!search) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Usage: /idx query <name>',
        };
      }
      return {
        type: 'tool',
        toolName: 'graph_query',
        toolArgs: { search },
      };
    }

    // Anything else: treat as a query shorthand (/idx someFunction)
    return {
      type: 'tool',
      toolName: 'graph_query',
      toolArgs: { search: subCommand },
    };
  },
};
