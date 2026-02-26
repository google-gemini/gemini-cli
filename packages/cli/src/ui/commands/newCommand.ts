/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { performNewSession } from '@google/gemini-cli-core';

export const newCommand: SlashCommand = {
  name: 'new',
  description: 'Start a new session and clear conversation history',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<void | SlashCommandActionReturn> => {
    const actionStream = performNewSession();

    for await (const action of actionStream) {
      if (action.type === 'message') {
        context.ui.addItem(
          {
            type: action.messageType,
            text: action.content,
          },
          Date.now(),
        );
      } else if (action.type === 'clear_session') {
        const geminiClient = context.services.config?.getGeminiClient();
        const config = context.services.config;
        const chatRecordingService = context.services.config
          ?.getGeminiClient()
          ?.getChat()
          .getChatRecordingService();

        if (geminiClient) {
          await geminiClient.resetChat();
        }

        // Reset user steering hints
        config?.userHintService.clear();

        // Start a new conversation recording with a new session ID
        if (config && chatRecordingService) {
          const newSessionId = randomUUID();
          config.setSessionId(newSessionId);
          chatRecordingService.initialize();
        }

        context.ui.clear();
      }
    }
  },
};
