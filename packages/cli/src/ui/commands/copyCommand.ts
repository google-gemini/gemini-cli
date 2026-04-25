/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { copyToClipboard } from '../utils/commandUtils.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

function extractTextFromParts(
  parts: Array<{
    text?: string;
    functionResponse?: { response?: { output?: unknown } };
  }>,
): string {
  return parts
    .map((part) => {
      if (part.text?.trim()) return part.text;
      const output = part.functionResponse?.response?.output;
      if (output !== undefined && output !== null) {
        return typeof output === 'string'
          ? output.trim()
          : JSON.stringify(output);
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

export const copyCommand: SlashCommand = {
  name: 'copy',
  description:
    'Copy the last AI response to clipboard. Use /copy 2 for second-to-last, /copy 3 for third, etc.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const index = args?.trim() ? parseInt(args.trim(), 10) : 1;

    if (isNaN(index) || index < 1) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid index. Usage: /copy or /copy <number> (e.g. /copy 2)',
      };
    }

    const chat = context.services.agentContext?.geminiClient?.getChat();
    const history = chat?.getHistory();

    const modelMessages = history
      ? history.filter((item) => item.role === 'model')
      : [];

    if (modelMessages.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No output in history',
      };
    }

    // index 1 = most recent, index 2 = second most recent, etc.
    const target = modelMessages[modelMessages.length - index];

    if (!target) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Only ${modelMessages.length} AI response(s) in history.`,
      };
    }

    const output = extractTextFromParts(target.parts ?? []);

    if (output) {
      try {
        const settings = context.services.settings.merged;
        await copyToClipboard(output, settings);

        const label =
          index === 1 ? 'Last output' : `Output #${index} from last`;
        return {
          type: 'message',
          messageType: 'info',
          content: `${label} copied to the clipboard`,
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
        content: 'AI output contains no text to copy.',
      };
    }
  },
};
