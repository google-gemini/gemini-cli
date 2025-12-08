/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { HistoryViewer } from '../components/HistoryViewer.js';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Navigate chat history to edit previous messages',
  kind: CommandKind.BUILT_IN,
  action: (context) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };
    }
    const client = config.getGeminiClient();
    const recordingService = client?.getChatRecordingService();

    if (!recordingService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Chat recording service not available.',
      };
    }

    const conversation = recordingService.getConversation();
    if (!conversation) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No active conversation found.',
      };
    }

    return {
      type: 'custom_dialog',
      component: (
        <HistoryViewer
          conversation={conversation}
          onExit={() => context.ui.removeComponent()}
        />
      ),
    };
  },
};
