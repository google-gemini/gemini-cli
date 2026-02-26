/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import {
  uiTelemetryService,
  SessionEndReason,
  SessionStartSource,
  flushTelemetry,
} from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

export const newCommand: SlashCommand = {
  name: 'new',
  description:
    'Start a fresh conversation while preserving the current session for /resume',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const config = context.services.config;

    // Fire SessionEnd hook before starting a new conversation.
    const hookSystem = config?.getHookSystem();
    if (hookSystem) {
      await hookSystem.fireSessionEndEvent(SessionEndReason.New);
    }

    if (geminiClient && config) {
      context.ui.setDebugMessage(
        'Starting new session and preserving current conversation.',
      );

      // Set the session ID before resetChat() so the newly created chat
      // recording uses the new session identifier.
      config.setSessionId(randomUUID());
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Starting new session.');
    }

    // Reset user steering hints.
    config?.userHintService.clear();

    // Fire SessionStart hook after starting a new conversation.
    let result;
    if (hookSystem) {
      result = await hookSystem.fireSessionStartEvent(SessionStartSource.New);
    }

    // Give the event loop a chance to process pending telemetry operations.
    await new Promise((resolve) => setImmediate(resolve));

    // Flush telemetry so hook output is written promptly.
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
