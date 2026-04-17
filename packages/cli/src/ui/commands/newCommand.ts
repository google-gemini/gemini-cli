/**
 * @license
 * Copyright 2026 Google LLC
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
  description:
    'Start a new conversation while preserving the current session for /resume',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const config = context.services.config;
    const chatRecordingService = context.services.config
      ?.getGeminiClient()
      ?.getChat()
      .getChatRecordingService();

    // Fire SessionEnd hook before starting a new session
    const hookSystem = config?.getHookSystem();
    if (hookSystem) {
      await hookSystem.fireSessionEndEvent(SessionEndReason.Clear);
    }

    if (geminiClient) {
      context.ui.setDebugMessage(
        'Starting new session and preserving current conversation.',
      );
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Starting new session.');
    }

    // Reset user steering hints
    config?.userHintService.clear();

    // Assign a new session ID before re-initializing the recording service.
    // This ensures the previous session's recording is preserved on disk under
    // its original session ID and remains available via /resume.
    if (config && chatRecordingService) {
      const newSessionId = randomUUID();
      config.setSessionId(newSessionId);
      chatRecordingService.initialize();
    }

    // Fire SessionStart hook for the new session
    let result;
    if (hookSystem) {
      result = await hookSystem.fireSessionStartEvent(SessionStartSource.Clear);
    }

    await new Promise((resolve) => setImmediate(resolve));

    if (config) {
      await flushTelemetry(config);
    }

    uiTelemetryService.setLastPromptTokenCount(0);
    context.ui.clear();

    if (result?.systemMessage) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: result.systemMessage,
        },
        Date.now(),
      );
    }
  },
};
