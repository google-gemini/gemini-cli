/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, type Content } from '@google/gemini-cli-core';
import { copyToClipboard } from '../utils/commandUtils.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

/** Returns true for internal system/steering messages that should not be shown to the user. */
const isSystemMessage = (text: string): boolean =>
  text.startsWith('<session_context>') ||
  (text.startsWith('<user_input>') && text.includes('Internal instruction:'));

/** Extracts the visible text from a history item, excluding thought/reasoning parts. */
const visibleText = (item: Content): string =>
  item.parts
    ?.filter((part) => part.text && !part.thought)
    .map((part) => part.text ?? '')
    .join('') ?? '';

export const copyCommand: SlashCommand = {
  name: 'copy',
  description: 'Copy the last result or code snippet to clipboard',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const chat = context.services.config?.getGeminiClient()?.getChat();
    const history = chat?.getHistory();

    // Get the last message from the AI (model role)
    const lastAiMessage = history
      ? history.filter((item) => item.role === 'model').pop()
      : undefined;

    if (!lastAiMessage) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No output in history',
      };
    }
    // Extract text from the parts
    const lastAiOutput = lastAiMessage.parts
      ?.filter((part) => part.text)
      .map((part) => part.text)
      .join('');

    if (lastAiOutput) {
      try {
        await copyToClipboard(lastAiOutput);

        return {
          type: 'message',
          messageType: 'info',
          content: 'Last output copied to the clipboard',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLogger.debug(message);

        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to copy to the clipboard. ${message}`,
        };
      }
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Last AI output contains no text to copy.',
      };
    }
  },
  subCommands: [
    {
      name: 'editor',
      description:
        'Open the full chat session in the configured external editor',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (
        context,
        _args,
      ): Promise<SlashCommandActionReturn | void> => {
        const chat = context.services.config?.getGeminiClient()?.getChat();
        const history = chat?.getHistory();

        if (!history || history.length === 0) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No chat history to open.',
          };
        }

        const filtered = history.filter((item) => {
          const text = visibleText(item);
          return text.length > 0 && !isSystemMessage(text);
        });

        if (filtered.length === 0) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No output in history',
          };
        }

        const content = filtered
          .map((item) => {
            const role = item.role === 'user' ? 'User' : 'Model';
            return `${role}:\n${visibleText(item)}`;
          })
          .join('\n\n---\n\n');

        return { type: 'open_in_editor', content };
      },
    },
  ],
};
