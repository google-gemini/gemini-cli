/**
 * @LICENSE
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DiscoveredMcpPrompt,
  GetPromptResponseSchema,
  mcpRequest,
} from '@google/gemini-cli-core';
import {
  SlashCommand,
  CommandContext,
  SlashCommandActionReturn,
} from './types.js';
import minimist from 'minimist';

// Helper to convert kebab-case to camelCase
const toCamelCase = (str: string) =>
  str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

export const promptCommand = (prompt: DiscoveredMcpPrompt): SlashCommand => {
  const commandName = prompt.name.replace(/_/g, '-');

  return {
    name: commandName,
    description: prompt.description,
    action: async (
      context: CommandContext,
      args: string,
    ): Promise<SlashCommandActionReturn> => {
      const argv = minimist(args.split(' '));
      const promptArgs: Record<string, string> = {};

      for (const key in argv) {
        if (key !== '_') {
          promptArgs[toCamelCase(key)] = argv[key];
        }
      }

      const response = await mcpRequest(
        prompt.serverName,
        'prompts/get',
        {
          name: prompt.name,
          arguments: promptArgs,
        },
        GetPromptResponseSchema,
      );

      if (response.type === 'error') {
        return {
          type: 'message',
          messageType: 'error',
          content: response.error,
        };
      }

      // TODO(asike): This is not ideal, we should probably have a better
      // way to send messages to the model.
      const lastMessage = response.result.messages.pop();
      if (!lastMessage) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'No messages returned from prompt.',
        };
      }

      return {
        type: 'prompt',
        prompt: lastMessage.content,
        promptType: 'user',
        context: response.result.messages,
      };
    },
  };
};