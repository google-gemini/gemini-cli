/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { terminalSetup } from '../utils/terminalSetup.js';
import { type MessageActionReturn } from '@google/gemini-cli-core';

/**
 * Command to configure terminal settings for an optimal experience.
 *
 * This command automatically detects and configures supported terminals
 * (VS Code, Cursor, Windsurf, Ghostty) to support features like multiline
 * input (newlines) and improved keyboard input mechanics.
 */
export const terminalSetupCommand: SlashCommand = {
  name: 'terminal-setup',
  description:
    'Configure terminal settings for newlines and improved input mechanics (VS Code, Cursor, Windsurf, Ghostty)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (): Promise<MessageActionReturn> => {
    try {
      const result = await terminalSetup();

      let content = result.message;
      if (result.requiresRestart) {
        content +=
          '\n\nPlease restart your terminal for the changes to take effect.';
      }

      return {
        type: 'message',
        content,
        messageType: result.success ? 'info' : 'error',
      };
    } catch (error) {
      return {
        type: 'message',
        content: `Failed to configure terminal: ${error}`,
        messageType: 'error',
      };
    }
  },
};
