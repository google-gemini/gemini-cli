/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createShowMemoryAction } from '../hooks/useShowMemoryCommand.js';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Commands for interacting with memory.',
  subCommands: [
    {
      name: 'show',
      description: 'Show the current memory contents.',
      action: async (context) => {
        const showMemory = createShowMemoryAction(
          context.services.config,
          context.services.settings,
          context.utils.addMessage,
        );
        await showMemory();
      },
    },
    {
      name: 'add',
      description: 'Add content to the memory.',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          context.utils.addMessage({
            type: MessageType.ERROR,
            content: 'Usage: /memory add <text to remember>',
            timestamp: new Date(),
          });
          return;
        }
        // UI feedback for attempting to schedule
        context.utils.addMessage({
          type: MessageType.INFO,
          content: `Attempting to save to memory: "${args.trim()}"`,
          timestamp: new Date(),
        });
        // Return info for scheduling the tool call
        return {
          shouldScheduleTool: true,
          toolName: 'save_memory',
          toolArgs: { fact: args.trim() },
        };
      },
    },
    {
      name: 'refresh',
      description: 'Refresh the memory from the source.',
      action: async (context) => {
        await context.actions.performMemoryRefresh();
      },
    },
  ],
};
