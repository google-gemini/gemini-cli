/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyToClipboard } from '../utils/commandUtils.js';
import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import i18n, { t } from '../../i18n/index.js';

export const copyCommand: SlashCommand = {
  name: 'copy',
  description: t('commands:descriptions.copy'),
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const chat = await context.services.config?.getGeminiClient()?.getChat();
    const history = chat?.getHistory();

    // Get the last message from the AI (model role)
    const lastAiMessage = history
      ? history.filter((item) => item.role === 'model').pop()
      : undefined;

    if (!lastAiMessage) {
      return {
        type: 'message',
        messageType: 'info',
        content: i18n.t('ui:copy.noHistory'),
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
          content: i18n.t('ui:copy.copySuccess'),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug(message);

        return {
          type: 'message',
          messageType: 'error',
          content: i18n.t('copy.failed', { ns: 'commands' }),
        };
      }
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: i18n.t('ui:copy.noTextToCopy'),
      };
    }
  },
};
