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
import { stripReferenceContent } from '../utils/formatters.js';
import { RewindOutcome } from '../components/RewindConfirmation.js';
import type { Content } from '@google/genai';
import {
  checkExhaustive,
  coreEvents,
  debugLogger,
  logRewind,
  RewindEvent,
  partToString,
  type ChatRecordingService,
  type GeminiClient,
  convertSessionToClientHistory,
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
 * @returns True if the rewind succeeded, false otherwise.
 */
async function rewindConversation(
  context: CommandContext,
  client: GeminiClient,
  recordingService: ChatRecordingService,
  messageId: string,
  newText: string,
): Promise<boolean> {
  try {
    const conversation = recordingService.rewindTo(messageId);
    if (!conversation) {
      const errorMsg = 'Could not fetch conversation file';
      debugLogger.error(errorMsg);
      context.ui.removeComponent();
      coreEvents.emitFeedback('error', errorMsg);
      return false;
    }

    // Convert to UI and Client formats
    const { uiHistory } = convertSessionToHistoryFormats(conversation.messages);
    const clientHistory = convertSessionToClientHistory(conversation.messages);

    client.setHistory(clientHistory as Content[]);

    // Reset context manager as we are rewinding history
    await context.services.agentContext?.config
      .getMemoryContextManager()
      ?.refresh();

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
    return true;
  } catch (error) {
    // If an error occurs, we still want to remove the component if possible
    context.ui.removeComponent();
    coreEvents.emitFeedback(
      'error',
      error instanceof Error ? error.message : 'Unknown error during rewind',
    );
    return false;
  }
}

export const rewindCommand: SlashCommand = {
  name: 'rewind',
  description: 'Jump back to a specific message and restart the conversation',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
    if (!config)
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };

    const client = agentContext.geminiClient;
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

    // Handle positional argument for stdin-driven rewind
    const argTrimmed = (args ?? '').trim();
    if (argTrimmed) {
      if (!/^-?\d+$/.test(argTrimmed)) {
        return {
          type: 'message',
          messageType: 'error',
          content:
            'Invalid argument. Usage: /rewind <index> (0-indexed, supports negative indexing)',
        };
      }

      const index = parseInt(argTrimmed, 10);
      const userMessages = conversation.messages.filter(
        (msg) => msg.type === 'user',
      );

      // Python-style negative indexing
      const resolvedIndex = index < 0 ? userMessages.length + index : index;

      if (resolvedIndex < 0 || resolvedIndex >= userMessages.length) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Index out of range. Valid range: -${userMessages.length} to ${userMessages.length - 1} (${userMessages.length} user messages).`,
        };
      }

      // Extract prompt text to restore in input buffer (matching TUI behavior)
      const userPrompt = userMessages[resolvedIndex];
      const contentToUse = userPrompt.displayContent || userPrompt.content;
      const originalUserText = contentToUse ? partToString(contentToUse) : '';
      const cleanedText = userPrompt.displayContent
        ? originalUserText
        : stripReferenceContent(originalUserText);

      logRewind(config, new RewindEvent(RewindOutcome.RewindOnly));
      const success = await rewindConversation(
        context,
        client,
        recordingService,
        userMessages[resolvedIndex].id,
        cleanedText,
      );
      if (!success) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Rewind failed. Check the debug console for details.',
        };
      }
      return {
        type: 'message',
        messageType: 'info',
        content: `Rewound to before user message ${resolvedIndex}.`,
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
