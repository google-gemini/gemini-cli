/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { HistoryViewer } from '../components/HistoryViewer.js';
import { MessageType, type HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';

import type { Content } from '@google/genai';
import { GeminiEventType } from '@google/gemini-cli-core';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'Navigate chat history to edit previous messages',
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
        <HistoryViewer
          conversation={conversation}
          onExit={() => context.ui.removeComponent()}
          onRewind={async (messageId, newText, promptCount) => {
            try {
              const updatedConversation = recordingService.rewindTo(messageId);

              // Convert to UI and Client formats
              const { uiHistory, clientHistory } =
                convertSessionToHistoryFormats(updatedConversation.messages);

              // Reset the client's internal history to match the file
              client.setHistory(clientHistory as unknown as Content[]);

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

              context.ui.addItem(
                {
                  type: MessageType.USER,
                  text: newText,
                },
                Date.now(),
              );

              context.ui.setPendingItem({ type: MessageType.GEMINI, text: '' });

              const abortController = new AbortController();

              const prompt_id =
                config.getSessionId() + '########' + promptCount;

              const stream = await client.sendMessageStream(
                [{ text: newText }],
                abortController.signal,
                prompt_id,
              );

              let fullResponseText = '';

              for await (const event of stream) {
                switch (event.type) {
                  case GeminiEventType.Content:
                    fullResponseText += event.value;
                    context.ui.setPendingItem({
                      type: MessageType.GEMINI,
                      text: fullResponseText,
                    });
                    break;

                  case GeminiEventType.Finished:
                    break;

                  case GeminiEventType.Error:
                    context.ui.addItem(
                      {
                        type: MessageType.ERROR,
                        text: event.value.error.message,
                      },
                      Date.now(),
                    );
                    break;
                  default:
                    continue;
                }
              }

              // Clear pending item
              context.ui.setPendingItem(null);

              // Add final Gemini message to UI and Disk
              if (fullResponseText) {
                context.ui.addItem(
                  {
                    type: MessageType.GEMINI,
                    text: fullResponseText,
                  },
                  Date.now(),
                );
              }
            } catch (error) {
              console.error('Failed to rewind and rerun:', error);
            }
          }}
        />
      ),
    };
  },
};
