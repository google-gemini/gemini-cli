/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { RewindViewer } from '../components/RewindViewer.js';
import { MessageType, type HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';

import type { Content } from '@google/genai';

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description: 'Jump back to a specific message and restart the conversation',
  kind: CommandKind.BUILT_IN,
  action: (context) => {
    const config = context.services.config;
    if (!config)
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };

    const client = config.getGeminiClient();
    if (!client)
      return {
        type: 'message',
        messageType: 'error',
        content: 'Client not initialized',
      };

    const recordingService = client.getChatRecordingService();
    if (!recordingService)
      return {
        type: 'message',
        messageType: 'error',
        content: 'Recording service unavailable',
      };

    const conversation = recordingService.getConversation();
    if (!conversation)
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation found.',
      };

    return {
      type: 'custom_dialog',
      component: (
        <RewindViewer
          conversation={conversation}
          onExit={() => context.ui.removeComponent()}
          onRewind={async (messageId, newText) => {
            try {
              const updatedConversation = recordingService.rewindTo(messageId);
              // Convert to UI and Client formats
              const { uiHistory, clientHistory } =
                convertSessionToHistoryFormats(updatedConversation.messages);

              // Reset the client's internal history to match the file
              client.setHistory(clientHistory as unknown as Content[]);

              // Reset context manager as we are rewinding history
              config.getContextManager()?.reset();

              // Update UI History
              // We generate IDs based on index for the rewind history
              const startId = 1;
              const historyWithIds = uiHistory.map(
                (item, idx) =>
                  ({
                    ...item,
                    id: startId + idx,
                  }) as HistoryItem,
              );

              context.ui.loadHistory(historyWithIds);

              context.ui.removeComponent();

              // Wait a tick for Ink to clear the screen
              await new Promise((resolve) => setTimeout(resolve, 50));

              // Submit the new text as a prompt to the main loop.
              // This delegates stream handling, tool execution, and history updates
              // (for the new message) to the main application logic.
              context.ui.submitPrompt(newText);
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text:
                    error instanceof Error
                      ? error.message
                      : 'Unknown error during rewind',
                },
                Date.now(),
              );
            }
          }}
        />
      ),
    };
  },
};
