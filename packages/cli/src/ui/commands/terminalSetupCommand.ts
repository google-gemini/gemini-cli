/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageActionReturn, SlashCommand, CommandKind } from './types.js';
import { terminalSetup } from '../utils/terminalSetup.js';
import { t } from 'i18next';

/**
 * Command to configure terminal keybindings for multiline input support.
 *
 * This command automatically detects and configures VS Code, Cursor, and Windsurf
 * to support Shift+Enter and Ctrl+Enter for multiline input.
 */
export const terminalSetupCommand: SlashCommand = {
  name: 'terminal-setup',
  get description() {
    return t('commands.terminalSetup.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,

  action: async (): Promise<MessageActionReturn> => {
    try {
      const result = await terminalSetup();

      let content = result.message;
      if (result.requiresRestart) {
        content += t('commands.terminalSetup.restartRequired', {
          ns: 'ui',
        });
      }

      return {
        type: 'message',
        content,
        messageType: result.success ? 'info' : 'error',
      };
    } catch (error) {
      return {
        type: 'message',
        content: t('commands.terminalSetup.failed', { error, ns: 'ui' }),
        messageType: 'error',
      };
    }
  },
};
