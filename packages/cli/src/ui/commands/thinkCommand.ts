/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { SettingScope } from '../../config/settings.js';

export const thinkCommand: SlashCommand = {
  name: 'think',
  description: 'Toggle inline thinking mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const { settings } = context.services;
    if (!settings) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Settings not loaded.',
      };
    }

    const currentMode = settings.merged.ui?.inlineThinkingMode || 'off';
    let newMode: 'off' | 'full' = currentMode === 'off' ? 'full' : 'off';

    const arg = args.trim().toLowerCase();
    if (arg === 'on' || arg === 'full') {
      newMode = 'full';
    } else if (arg === 'off') {
      newMode = 'off';
    }

    settings.setValue(SettingScope.User, 'ui.inlineThinkingMode', newMode);

    return {
      type: 'message',
      messageType: 'info',
      content: `Inline thinking mode set to **${newMode}**.`,
    };
  },
};
