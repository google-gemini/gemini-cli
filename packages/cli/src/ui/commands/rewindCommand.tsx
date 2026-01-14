/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { RewindViewer } from '../components/RewindViewer.js';
import { type HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';
import { revertFileChanges } from '../utils/rewindFileOps.js';
import { RewindOutcome } from '../components/RewindConfirmation.js';
import { checkExhaustive } from '../../utils/checks.js';

import type { Content } from '@google/genai';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';

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
          onExit={() => {
            context.ui.removeComponent();
            context.ui.clearTextToast();
          }}
          onRewind={async (messageId, newText, outcome) => {
            try {
              switch (outcome) {
                case RewindOutcome.Cancel:
                  context.ui.removeComponent();
                  context.ui.clearTextToast();
                  return;

                case RewindOutcome.RevertOnly:
                  if (conversation) {
                    await revertFileChanges(conversation, messageId);
                  }
                  context.ui.removeComponent();
                  coreEvents.emitFeedback('info', 'File changes reverted.');
                  return;

                case RewindOutcome.RewindAndRevert:
                  if (conversation) {
                    await revertFileChanges(conversation, messageId);
                  }
                  // Proceed to rewind logic
                  break;

                case RewindOutcome.RewindOnly:
                  // Proceed to rewind logic
                  break;

                default:
                  checkExhaustive(outcome);
              }

              const rewindedConvesation = recordingService.rewindTo(messageId);
              if (!rewindedConvesation) {
                const errorMsg = 'Could not fetch conversation file';
                debugLogger.error(errorMsg);
                context.ui.removeComponent();
                coreEvents.emitFeedback('error', errorMsg);
                return;
              }

              // Convert to UI and Client formats
              const { uiHistory, clientHistory } =
                convertSessionToHistoryFormats(rewindedConvesation.messages);

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
              coreEvents.emitFeedback(
                'error',
                error instanceof Error
                  ? error.message
                  : 'Unknown error during rewind',
              );
            }
          }}
        />
      ),
    };
  },
};
