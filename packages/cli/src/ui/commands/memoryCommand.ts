/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  addMemory,
  type Config,
  listMemoryFiles,
  refreshMemory,
  showMemory,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  CommandKind,
  type OpenCustomDialogActionReturn,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { InboxDialog } from '../components/InboxDialog.js';

const showSubCommand: SlashCommand = {
  name: 'show',
  description: 'Show the current memory contents',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) return;
    const result = showMemory(config);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: result.content,
      },
      Date.now(),
    );
  },
};

const addSubCommand: SlashCommand = {
  name: 'add',
  description: 'Add content to the memory',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context, args): SlashCommandActionReturn | void => {
    const result = addMemory(args);

    if (result.type === 'message') {
      return result;
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Attempting to save to memory: "${args.trim()}"`,
      },
      Date.now(),
    );

    return result;
  },
};

const reloadSubCommand: SlashCommand = {
  name: 'reload',
  altNames: ['refresh'],
  description: 'Reload the memory from the source',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Reloading memory from source files...',
      },
      Date.now(),
    );

    try {
      const config = context.services.agentContext?.config;
      if (config) {
        const result = await refreshMemory(config);

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: result.content,
          },
          Date.now(),
        );
      }
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          text: `Error reloading memory: ${(error as Error).message}`,
        },
        Date.now(),
      );
    }
  },
};

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'Lists the paths of the GEMINI.md files in use',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) return;
    const result = listMemoryFiles(config);

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: result.content,
      },
      Date.now(),
    );
  },
};

const inboxSubCommand: SlashCommand = {
  name: 'inbox',
  description:
    'Review skills extracted from past sessions and move them to global or project skills',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (
    context,
  ): OpenCustomDialogActionReturn | SlashCommandActionReturn | void => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    if (!config.isAutoMemoryEnabled()) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'The memory inbox requires Auto Memory. Enable it with: experimental.autoMemory = true in settings.',
      };
    }

    return {
      type: 'custom_dialog',
      component: React.createElement(InboxDialog, {
        config,
        onClose: () => context.ui.removeComponent(),
        onReloadSkills: async () => {
          await config.reloadSkills();
          context.ui.reloadCommands();
        },
        onReloadMemory: async () => {
          await refreshMemory(config);
        },
      }),
    };
  },
};

export const memoryCommand = (config: Config | null): SlashCommand => {
  // The `add` subcommand depends on the `save_memory` tool, which is not
  // registered when Memory v2 is enabled. Omit it in that case.
  const isMemoryV2 = config?.isMemoryV2Enabled() ?? false;

  const subCommands: SlashCommand[] = [
    showSubCommand,
    ...(isMemoryV2 ? [] : [addSubCommand]),
    reloadSubCommand,
    listSubCommand,
    inboxSubCommand,
  ];

  return {
    name: 'memory',
    description: 'Commands for interacting with memory',
    kind: CommandKind.BUILT_IN,
    autoExecute: false,
    subCommands,
  };
};
