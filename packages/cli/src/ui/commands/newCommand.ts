/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  uiTelemetryService,
  SessionEndReason,
  SessionStartSource,
  flushTelemetry,
} from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { randomUUID } from 'node:crypto';

export const newCommand: SlashCommand = {
  name: 'new',
  description: 'Start a new chat session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const config = context.services.config;
    const chatRecordingService = context.services.config
      ?.getGeminiClient()
      ?.getChat()
      .getChatRecordingService();

    // Fire SessionEnd hook before starting new session
    await config?.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear);

    if (geminiClient) {
      // We reset the chat to clear in-memory history, but we do NOT clearing the terminal
      // output implicitly. The user can still see previous output.
      context.ui.setDebugMessage('Resetting chat for new session.');
      await geminiClient.resetChat();
    }

    // Start a new conversation recording with a new session ID
    if (config && chatRecordingService) {
      const newSessionId = randomUUID();
      config.setSessionId(newSessionId);
      chatRecordingService.initialize();
    }

    // Fire SessionStart hook after clearing
    const result = await config
      ?.getHookSystem()
      ?.fireSessionStartEvent(SessionStartSource.Clear); // Using Clear source as it is similar

    // Give the event loop a chance to process any pending telemetry operations
    await new Promise((resolve) => setImmediate(resolve));

    // Flush telemetry
    if (config) {
      await flushTelemetry(config);
    }

    uiTelemetryService.setLastPromptTokenCount(0);
    // context.ui.clear();  <-- NOT clearing the screen, unlike /clear

    // Notify user
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Started a new chat session. Previous session saved.',
      },
      Date.now(),
    );

    if (result?.finalOutput?.systemMessage) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: result.finalOutput.systemMessage,
        },
        Date.now(),
      );
    }
  },
};
