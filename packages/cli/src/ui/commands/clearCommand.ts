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

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the screen and conversation history',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const config = context.services.config;
    const chatRecordingService = context.services.config
      ?.getGeminiClient()
      ?.getChat()
      .getChatRecordingService();

    // Fire SessionEnd hook before clearing
    await config?.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear);

    if (geminiClient) {
      context.ui.setDebugMessage('Clearing terminal and resetting chat.');
      // If resetChat fails, the exception will propagate and halt the command,
      // which is the correct behavior to signal a failure to the user.
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Clearing terminal.');
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
      ?.fireSessionStartEvent(SessionStartSource.Clear);

    // Give the event loop a chance to process any pending telemetry operations
    // This ensures logger.emit() calls have fully propagated to the BatchLogRecordProcessor
    await new Promise((resolve) => setImmediate(resolve));

    // Flush telemetry to ensure hooks are written to disk immediately
    // This is critical for tests and environments with I/O latency
    if (config) {
      await flushTelemetry(config);
    }

    uiTelemetryService.setLastPromptTokenCount(0);
    context.ui.clear();

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
