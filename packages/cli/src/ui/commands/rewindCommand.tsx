/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import { RewindViewer } from '../components/RewindViewer.js';
import { type HistoryItem } from '../types.js';
import { convertSessionToHistoryFormats } from '../hooks/useSessionBrowser.js';
import { revertFileChanges } from '../utils/rewindFileOps.js';
import { RewindOutcome } from '../components/RewindConfirmation.js';
import type { Content } from '@google/genai';
import {
  checkExhaustive,
  coreEvents,
  debugLogger,
  logRewind,
  RewindEvent,
  type ChatRecordingService,
  type GeminiClient,
} from '@google/gemini-cli-core';

/**
 * Helper function to handle the core logic of rewinding a conversation.
 * This function encapsulates the steps needed to rewind the conversation,
 * update the client and UI history, and clear the component.
 *
 * @param context The command context.
 * @param client Gemini client
 * @param recordingService The chat recording service.
 * @param messageId The ID of the message to rewind to.
 * @param newText The new text for the input field after rewinding.
 */
async function rewindConversation(
  context: CommandContext,
  client: GeminiClient,
  recordingService: ChatRecordingService,
  messageId: string,
  newText: string,
) {
  try {
    const conversation = recordingService.rewindTo(messageId);
    if (!conversation) {
      const errorMsg = 'Could not fetch conversation file';
      debugLogger.error(errorMsg);
      context.ui.removeComponent();
      coreEvents.emitFeedback('error', errorMsg);
      return;
    }

    // Convert to UI and Client formats
    const { uiHistory, clientHistory } = convertSessionToHistoryFormats(
      conversation.messages,
    );

    client.setHistory(clientHistory as Content[]);

    // Reset context manager as we are rewinding history
    await context.services.config?.getContextManager()?.refresh();

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
      error instanceof Error ? error.message : 'Unknown error during rewind',
    );
  }
}

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

    const hasUserInteractions = conversation.messages.some(
      (msg) => msg.type === 'user',
    );
    if (!hasUserInteractions) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to rewind to.',
      };
    }

    return {
      type: 'custom_dialog',
      component: (
        <RewindViewer
          conversation={conversation}
          onExit={() => {
            context.ui.removeComponent();
          }}
          onRewind={async (messageId, newText, outcome) => {
            if (outcome !== RewindOutcome.Cancel) {
              logRewind(config, new RewindEvent(outcome));
            }
            switch (outcome) {
              case RewindOutcome.Cancel:
                context.ui.removeComponent();
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
                await rewindConversation(
                  context,
                  client,
                  recordingService,
                  messageId,
                  newText,
                );
                return;

              case RewindOutcome.RewindOnly:
                await rewindConversation(
                  context,
                  client,
                  recordingService,
                  messageId,
                  newText,
                );
                return;

              default:
                checkExhaustive(outcome);
            }
          }}
        />
      ),
    };
  },
};
