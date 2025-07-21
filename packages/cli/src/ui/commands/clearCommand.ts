/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { uiTelemetryService } from '@google/gemini-cli-core';
import { CommandKind, SlashCommand } from './types.js';
import { randomUUID } from 'crypto';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'clear the screen and conversation history',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const config = context.services.config;
    const chatRecording = context.services.chatRecording;

    if (geminiClient) {
      context.ui.setDebugMessage('Clearing terminal and resetting chat.');
      // If resetChat fails, the exception will propagate and halt the command,
      // which is the correct behavior to signal a failure to the user.
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Clearing terminal.');
    }

    // Start a new conversation recording with a new session ID
    if (config && chatRecording) {
      const newSessionId = randomUUID();
      config.setSessionId(newSessionId);
      chatRecording.reinitializeWithSession(newSessionId);
    }

    uiTelemetryService.resetLastPromptTokenCount();
    context.ui.clear();
  },
};
