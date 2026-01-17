/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyToClipboard } from '../utils/commandUtils.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const copyPromptCommand: SlashCommand = {
  name: 'copyprompt',
  description: 'Copy the last prompt to clipboard',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const chat = await context.services.config?.getGeminiClient()?.getChat();
    const history = chat?.getHistory();

    // Get the last message from the user (user role)
    const lastUserMessage = history
      ? [...history].reverse().find((item) => item.role === 'user')
      : undefined;

    if (!lastUserMessage) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No prompt in history',
      };
    }
    // Extract text from the parts
    const lastUserOutput = (lastUserMessage.parts ?? [])
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('');

    if (lastUserOutput) {
      try {
        await copyToClipboard(lastUserOutput);

        return {
          type: 'message',
          messageType: 'info',
          content: 'Last prompt copied to the clipboard',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug(message);

        return {
          type: 'message',
          messageType: 'error',
          content: 'Failed to copy to the clipboard.',
        };
      }
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Last prompt contains no text to copy.',
      };
    }
  },
};
