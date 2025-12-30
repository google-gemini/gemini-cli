/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { RewindViewer } from '../components/RewindViewer.js';
import { MessageType, type HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';
import { revertFileChanges } from '../utils/rewindFileOps.js';
import { RewindOutcome } from '../components/RewindConfirmation.js';

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
          onRewind={async (messageId, newText, outcome) => {
            try {
              if (outcome === RewindOutcome.Cancel) {
                context.ui.removeComponent();
                return;
              }

              if (
                outcome === RewindOutcome.RewindAndRevert ||
                outcome === RewindOutcome.RevertOnly
              ) {
                const currentConversation = recordingService.getConversation();
                if (currentConversation) {
                  await revertFileChanges(currentConversation, messageId);
                }
              }

              if (outcome === RewindOutcome.RevertOnly) {
                context.ui.removeComponent();
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: 'File changes reverted.',
                  },
                  Date.now(),
                );
                return;
              }

              let updatedConversation = conversation;
              if (
                outcome === RewindOutcome.RewindOnly ||
                outcome === RewindOutcome.RewindAndRevert
              ) {
                updatedConversation = recordingService.rewindTo(messageId);
              }
              // Convert to UI and Client formats
              const { uiHistory, clientHistory } =
                convertSessionToHistoryFormats(updatedConversation.messages);

              // Reset the client's internal history to match the file
              client.setHistory(clientHistory as Content[]);

              // Reset context manager as we are rewinding history
              await config.getContextManager()?.refresh();

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

              // 1. Remove component FIRST to avoid flicker and clear the stage
              context.ui.removeComponent();

              // 2. Load the rewound history and set the input
              context.ui.loadHistory(historyWithIds, newText);
            } catch (error) {
              // If an error occurs, we still want to remove the component if possible
              context.ui.removeComponent();
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
