/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  MessageActionReturn,
  CommandContext,
} from './types.js';
import { CommandKind } from './types.js';
import {
  saveHfApiKey,
  loadHfApiKey,
  clearHfApiKey,
} from '@google/gemini-cli-core';
import prompts from 'prompts';

export const hfkeyCommand: SlashCommand = {
  name: 'hfkey',
  description: 'Set or manage HuggingFace API key for image generation',
  kind: CommandKind.BUILT_IN,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const trimmedArgs = args.trim().toLowerCase();

    // Handle subcommands
    if (trimmedArgs === 'clear' || trimmedArgs === 'remove') {
      await clearHfApiKey();
      return {
        type: 'message',
        messageType: 'info',
        content: 'HuggingFace API key has been cleared.',
      };
    }

    if (trimmedArgs === 'show' || trimmedArgs === 'view') {
      const existingKey = await loadHfApiKey();
      if (existingKey) {
        // Show only first 8 and last 4 characters for security
        const masked = `${existingKey.substring(0, 8)}...${existingKey.substring(existingKey.length - 4)}`;
        return {
          type: 'message',
          messageType: 'info',
          content: `Current HuggingFace API key: ${masked}`,
        };
      } else {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No HuggingFace API key is currently set.',
        };
      }
    }

    // If args provided, use them as the key directly
    if (trimmedArgs.length > 0 && trimmedArgs.startsWith('hf_')) {
      await saveHfApiKey(trimmedArgs);
      return {
        type: 'message',
        messageType: 'info',
        content:
          'HuggingFace API key has been saved successfully. You can now use the huggingface_image_generation tool.',
      };
    }

    // Otherwise, prompt for the key
    const response = await prompts({
      type: 'password',
      name: 'apiKey',
      message: 'Enter your HuggingFace API key (starts with hf_):',
      validate: (value: string) =>
        value.startsWith('hf_') || 'API key must start with hf_',
    });

    if (!response.apiKey) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Operation cancelled.',
      };
    }

    await saveHfApiKey(response.apiKey);
    return {
      type: 'message',
      messageType: 'info',
      content:
        'HuggingFace API key has been saved successfully. You can now use the huggingface_image_generation tool.\n\nGet your free API key at: https://huggingface.co/settings/tokens',
    };
  },
};
