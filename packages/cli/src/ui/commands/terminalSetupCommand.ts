/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { terminalSetup } from '../utils/terminalSetup.js';
import { type MessageActionReturn } from '@google/gemini-cli-core';

/**
 * Command to configure terminal keybindings for multiline input support.
 *
 * This command automatically detects and configures VS Code, Cursor, and Windsurf
 * to support Shift+Enter and Ctrl+Enter for multiline input.
 */
export const terminalSetupCommand: SlashCommand = {
  name: 'terminal-setup',
  description:
    'Configure terminal keybindings for multiline input (VS Code, Cursor, Windsurf)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (): Promise<MessageActionReturn> => {
    try {
      const result = await terminalSetup();

      let content = result.message;
      if (result.requiresRestart) {
        content += t('commands:terminalSetup.responses.restartRequired');
      }

      return {
        type: 'message',
        content,
        messageType: result.success ? 'info' : 'error',
      };
    } catch (error) {
      return {
        type: 'message',
        content: t('commands:terminalSetup.responses.failed', { error }),
        messageType: 'error',
      };
    }
  },
};
