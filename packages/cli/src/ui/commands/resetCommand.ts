/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { uiTelemetryService } from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const resetCommand: SlashCommand = {
  name: 'reset',
  description: 'clear the conversation history and reset the session',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();

    if (geminiClient) {
      context.ui.setDebugMessage('Resetting chat session.');
      // If resetChat fails, the exception will propagate and halt the command,
      // which is the correct behavior to signal a failure to the user.
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Could not find an active session to reset.');
    }

    uiTelemetryService.setLastPromptTokenCount(0);
  },
};
