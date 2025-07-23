/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { Config } from '@google/gemini-cli-core';
import { LoadHistoryActionReturn } from '../commands/types.js';
import { HistoryItemWithoutId } from '../types.js';
import { ChatRecordingService } from '@google/gemini-cli-core';
import * as fs from 'fs/promises';
import path from 'path';
import { ConversationRecord } from '@google/gemini-cli-core';
import { MessageType, ToolCallStatus } from '../types.js';

export const useSessionBrowser = (
  config: Config,
  chatRecordingService: ChatRecordingService,
  onLoadHistory: (result: LoadHistoryActionReturn) => void,
) => {
  const [isSessionBrowserOpen, setIsSessionBrowserOpen] = useState(false);

  return {
    isSessionBrowserOpen,

    openSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(true);
    }, []),

    closeSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(false);
    }, []),

    /**
     * Loads a conversation by ID, and reinitializes the chat recording service with it.
     */
    handleResumeSession: useCallback(
      async (sessionId: string) => {
        try {
          const chatsDir = path.join(config.getProjectTempDir(), 'chats');
          const originalFilePath = path.join(chatsDir, `${sessionId}.json`);

          // Load up the conversation.
          const conversation: ConversationRecord = JSON.parse(
            await fs.readFile(originalFilePath, 'utf8'),
          );

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);
          chatRecordingService.reinitializeWithSession(
            existingSessionId,
            originalFilePath,
          );

          // We've loaded it, tell the UI about it.
          setIsSessionBrowserOpen(false);
          onLoadHistory(convertSessionToHistoryFormats(conversation.messages));
        } catch (error) {
          console.error('Error resuming session:', error);
          // For now, just close the browser on error
          setIsSessionBrowserOpen(false);
        }
      },
      [config, chatRecordingService, onLoadHistory],
    ),
  };
};

/**
 * Converts session/conversation data into UI history and Gemini client history formats.
 * This shared function eliminates duplication between App.tsx resume logic and useSessionBrowser.
 */
export function convertSessionToHistoryFormats(
  messages: ConversationRecord['messages'],
): LoadHistoryActionReturn {
  const uiHistory: HistoryItemWithoutId[] = [];

  for (const msg of messages) {
    // Add the message only if it has content
    if (msg.content && msg.content.trim()) {
      let messageType: MessageType;
      switch (msg.type) {
        case 'user':
          messageType = MessageType.USER;
          break;
        case 'system':
          messageType = MessageType.INFO;
          break;
        case 'error':
          messageType = MessageType.ERROR;
          break;
        default:
          messageType = MessageType.GEMINI;
          break;
      }

      uiHistory.push({
        type: messageType,
        text: msg.content,
      });
    }

    // Add tool calls if present
    if (
      msg.type !== 'user' &&
      'toolCalls' in msg &&
      msg.toolCalls &&
      msg.toolCalls.length > 0
    ) {
      uiHistory.push({
        type: 'tool_group',
        tools: msg.toolCalls.map((tool) => ({
          callId: tool.id,
          name: tool.displayName || tool.name,
          description: tool.description || '',
          renderOutputAsMarkdown: tool.renderOutputAsMarkdown || true,
          status:
            tool.status === 'success'
              ? ToolCallStatus.Success
              : ToolCallStatus.Error,
          resultDisplay: tool.resultDisplay,
          confirmationDetails: undefined,
        })),
      });
    }
  }

  // Convert to Gemini client history format
  const clientHistory = messages
    .filter((msg) => {
      if (msg.type === 'user') {
        // Skip user slash commands.
        return (
          !msg.content.trim().startsWith('/') &&
          !msg.content.trim().startsWith('?')
        );
      }

      // All Gemini.
      if (msg.type == 'gemini') {
        return true;
      }

      // System, error--don't pass these through.
      return false;
    })
    .map((msg) => ({
      role: msg.type === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: msg.content }],
    }));

  return {
    history: uiHistory,
    clientHistory,
    type: 'load_history',
  };
}
