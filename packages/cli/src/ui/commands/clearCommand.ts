/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { uiTelemetryService } from '@google/gemini-cli-core';
import { t } from 'i18next';
import { CommandKind, SlashCommand } from './types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  get description() {
    return t('commands.clear.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();

    if (geminiClient) {
      context.ui.setDebugMessage(t('errors:core.clearingTerminal'));
      // If resetChat fails, the exception will propagate and halt the command,
      // which is the correct behavior to signal a failure to the user.
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Clearing terminal.');
    }

    uiTelemetryService.resetLastPromptTokenCount();
    context.ui.clear();
  },
};
