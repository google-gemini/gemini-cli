/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { t, setLanguage, type Language } from '../utils/i18n.js';
import { SettingScope } from '../../config/settings.js';

export const languageCommand: SlashCommand = {
  name: 'language',
  get description() {
    return t('command.language.description');
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const lang = args.trim().toLowerCase();
    if (lang === 'en' || lang === 'zh') {
      setLanguage(lang as Language);
      context.services.settings.setValue(
        SettingScope.User,
        'general.language',
        lang,
      );
      if (context.services.config) {
        context.services.config.setLanguage(lang);
      }
      // Trigger a reload of commands to refresh descriptions in the UI
      context.ui.reloadCommands();

      return {
        type: 'message',
        messageType: 'info',
        content: t('command.language.success', {
          lang: lang === 'en' ? 'English' : '中文',
        }),
      };
    }

    // If no valid arg, show a message with instructions
    return {
      type: 'message',
      messageType: 'info',
      content: t('command.language.prompt') + ' /language en | /language zh',
    };
  },
};
