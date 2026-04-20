/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';
import type { Content } from '@google/genai';
import { convertSessionToClientHistory } from '@google/gemini-cli-core';

export const undoCommand: SlashCommand = {
  name: 'undo',
  description:
    'Undo the last turn (remove last user message and model response)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };
    }

    const client = config.getGeminiClient();
    if (!client) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Client not initialized',
      };
    }

    const recordingService = client.getChatRecordingService();
    if (!recordingService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Recording service unavailable',
      };
    }

    const conversation = recordingService.getConversation();
    if (!conversation) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation found.',
      };
    }

    // Find the last user message to rewind to
    const lastUserMessageIndex = conversation.messages.findLastIndex(
      (msg) => msg.type === 'user',
    );

    if (lastUserMessageIndex === -1) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to undo.',
      };
    }

    const lastUserMessage = conversation.messages[lastUserMessageIndex];

    // Rewind to the last user message (this removes it and everything after it)
    const rewoundConversation = recordingService.rewindTo(lastUserMessage.id);
    if (!rewoundConversation) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Failed to undo the last turn.',
      };
    }

    // Convert to UI and Client formats
    const { uiHistory } = convertSessionToHistoryFormats(
      rewoundConversation.messages,
    );
    const clientHistory = convertSessionToClientHistory(
      rewoundConversation.messages,
    );

    client.setHistory(clientHistory as Content[]);

    // Reset context manager as we are modifying history
    await config.getContextManager()?.refresh();

    // Generate IDs for the history items
    const startId = 1;
    const historyWithIds = uiHistory.map(
      (item, idx) =>
        ({
          ...item,
          id: startId + idx,
        }) as HistoryItem,
    );

    // Load the updated history into the UI
    context.ui.loadHistory(historyWithIds);

    return {
      type: 'message',
      messageType: 'info',
      content: 'Last turn undone.',
    };
  },
};
