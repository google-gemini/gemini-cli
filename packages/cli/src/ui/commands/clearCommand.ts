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
  resetBrowserSession,
} from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { randomUUID } from 'node:crypto';

export const clearCommand: SlashCommand = {
  name: 'clear',
  altNames: ['new'],
  description: 'Clear the screen and start a new session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const geminiClient = context.services.agentContext?.geminiClient;
    const config = context.services.agentContext?.config;

    // Fire SessionEnd hook before clearing
    const hookSystem = config?.getHookSystem();
    if (hookSystem) {
      await hookSystem.fireSessionEndEvent(SessionEndReason.Clear);
    }

    // Reset user steering hints
    config?.injectionService.clear();

    // Start a new conversation recording with a new session ID
    // We MUST do this before calling resetChat() so the new ChatRecordingService
    // initialized by GeminiChat picks up the new session ID.
    let newSessionId: string | undefined;
    if (config) {
      newSessionId = randomUUID();
      config.resetNewSessionState(newSessionId);
    }

    if (geminiClient) {
      context.ui.setDebugMessage('Clearing terminal and resetting chat.');

      // Close persistent browser sessions before resetting chat
      await resetBrowserSession();

      // If resetChat fails, the exception will propagate and halt the command,
      // which is the correct behavior to signal a failure to the user.
      await geminiClient.resetChat();
    } else {
      context.ui.setDebugMessage('Clearing terminal.');
    }

    // Fire SessionStart hook after clearing
    let result;
    if (hookSystem) {
      result = await hookSystem.fireSessionStartEvent(SessionStartSource.Clear);
    }

    // Give the event loop a chance to process any pending telemetry operations
    // This ensures logger.emit() calls have fully propagated to the BatchLogRecordProcessor
    await new Promise((resolve) => setImmediate(resolve));

    // Flush telemetry to ensure hooks are written to disk immediately
    // This is critical for tests and environments with I/O latency
    if (config) {
      await flushTelemetry(config);
    }

    uiTelemetryService.clear(newSessionId);
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
