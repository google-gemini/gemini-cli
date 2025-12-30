/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemWithoutId } from '../types.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Config,
  ConversationRecord,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import { partListUnionToString, coreEvents } from '@google/gemini-cli-core';
import type { SessionInfo } from '../../utils/sessionUtils.js';
import { MessageType, ToolCallStatus } from '../types.js';

export const useSessionBrowser = (
  config: Config,
  onLoadHistory: (
    uiHistory: HistoryItemWithoutId[],
    clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>,
    resumedSessionData: ResumedSessionData,
  ) => void,
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
      async (session: SessionInfo) => {
        try {
          const chatsDir = path.join(
            config.storage.getProjectTempDir(),
            'chats',
          );

          const fileName = session.fileName;

          const originalFilePath = path.join(chatsDir, fileName);

          // Load up the conversation.
          const conversation: ConversationRecord = JSON.parse(
            await fs.readFile(originalFilePath, 'utf8'),
          );

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);

          const resumedSessionData = {
            conversation,
            filePath: originalFilePath,
          };

          // We've loaded it; tell the UI about it.
          setIsSessionBrowserOpen(false);
          const historyData = convertSessionToHistoryFormats(
            conversation.messages,
          );
          onLoadHistory(
            historyData.uiHistory,
            historyData.clientHistory,
            resumedSessionData,
          );
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error resuming session:', error);
          setIsSessionBrowserOpen(false);
        }
      },
      [config, onLoadHistory],
    ),

    /**
     * Deletes a session by ID using the ChatRecordingService.
     */
    handleDeleteSession: useCallback(
      (session: SessionInfo) => {
        // Note: Chat sessions are stored on disk using a filename derived from
        // the session, e.g. "session-<timestamp>-<sessionIdPrefix>.json".
        // The ChatRecordingService.deleteSession API expects this file basename
        // (without the ".json" extension), not the full session UUID.
        try {
          const chatRecordingService = config
            .getGeminiClient()
            ?.getChatRecordingService();
          if (chatRecordingService) {
            chatRecordingService.deleteSession(session.file);
          }
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error deleting session:', error);
          throw error;
        }
      },
      [config],
    ),
  };
};

/**
 * Converts session/conversation data into UI history and Gemini client history formats.
 */
export function convertSessionToHistoryFormats(
  messages: ConversationRecord['messages'],
): {
  uiHistory: HistoryItemWithoutId[];
  clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>;
} {
  const uiHistory: HistoryItemWithoutId[] = [];

  for (const msg of messages) {
    // Add the message only if it has content
    const contentString = partListUnionToString(msg.content);
    if (msg.content && contentString.trim()) {
      let messageType: MessageType;
      switch (msg.type) {
        case 'user':
          messageType = MessageType.USER;
          break;
        case 'info':
          messageType = MessageType.INFO;
          break;
        case 'error':
          messageType = MessageType.ERROR;
          break;
        case 'warning':
          messageType = MessageType.WARNING;
          break;
        default:
          messageType = MessageType.GEMINI;
          break;
      }

      uiHistory.push({
        type: messageType,
        text: contentString,
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
          renderOutputAsMarkdown: tool.renderOutputAsMarkdown ?? true,
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
  const clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }> = [];

  for (const msg of messages) {
    // Skip system/error messages and user slash commands
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      // Skip user slash commands
      const contentString = partListUnionToString(msg.content);
      if (
        contentString.trim().startsWith('/') ||
        contentString.trim().startsWith('?')
      ) {
        continue;
      }

      // Add regular user message
      clientHistory.push({
        role: 'user',
        parts: [{ text: contentString }],
      });
    } else if (msg.type === 'gemini') {
      // Handle Gemini messages with potential tool calls
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        // Create model message with function calls
        const modelParts: Part[] = [];

        // Add text content if present
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          modelParts.push({ text: contentString });
        }

        // Add function calls
        for (const toolCall of msg.toolCalls!) {
          modelParts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
              ...(toolCall.id && { id: toolCall.id }),
            },
          });
        }

        clientHistory.push({
          role: 'model',
          parts: modelParts,
        });

        // Create single function response message with all tool call responses
        const functionResponseParts: Part[] = [];
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            // Convert PartListUnion result to function response format
            let responseData: Part;

            if (typeof toolCall.result === 'string') {
              responseData = {
                functionResponse: {
                  id: toolCall.id,
                  name: toolCall.name,
                  response: {
                    output: toolCall.result,
                  },
                },
              };
            } else if (Array.isArray(toolCall.result)) {
              // toolCall.result is an array containing properly formatted
              // function responses
              functionResponseParts.push(...(toolCall.result as Part[]));
              continue;
            } else {
              // Fallback for non-array results
              responseData = toolCall.result;
            }

            functionResponseParts.push(responseData);
          }
        }

        // Only add user message if we have function responses
        if (functionResponseParts.length > 0) {
          clientHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });
        }
      } else {
        // Regular Gemini message without tool calls
        const contentString = partListUnionToString(msg.content);
        if (msg.content && contentString.trim()) {
          clientHistory.push({
            role: 'model',
            parts: [{ text: contentString }],
          });
        }
      }
    }
  }

  return {
    uiHistory,
    clientHistory,
  };
}
