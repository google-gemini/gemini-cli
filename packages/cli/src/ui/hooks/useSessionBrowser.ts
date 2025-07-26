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
          chatRecordingService.initialize({
            conversation,
            filePath: originalFilePath,
          });

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
  const clientHistory: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const msg of messages) {
    // Skip system/error messages and user slash commands
    if (msg.type === 'system' || msg.type === 'error') {
      continue;
    }

    if (msg.type === 'user') {
      // Skip user slash commands
      if (
        msg.content.trim().startsWith('/') ||
        msg.content.trim().startsWith('?')
      ) {
        continue;
      }

      // Add regular user message
      clientHistory.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    } else if (msg.type === 'gemini') {
      // Handle Gemini messages with potential tool calls
      const hasToolCalls =
        'toolCalls' in msg && msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        // Create model message with function calls
        const modelParts: any[] = [];

        // Add text content if present
        if (msg.content && msg.content.trim()) {
          modelParts.push({ text: msg.content });
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

        // Create function response messages
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            // Convert PartListUnion result to function response format
            let responseData: any;

            if (typeof toolCall.result === 'string') {
              responseData = { output: toolCall.result };
            } else if (Array.isArray(toolCall.result)) {
              // Extract text content from Part array
              const textParts = toolCall.result
                .filter((part: any) => part.text)
                .map((part: any) => part.text)
                .join('');
              responseData = textParts
                ? { output: textParts }
                : toolCall.result;
            } else {
              responseData = toolCall.result;
            }

            clientHistory.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: toolCall.name,
                    response: responseData,
                  },
                },
              ],
            });
          }
        }
      } else {
        // Regular Gemini message without tool calls
        if (msg.content && msg.content.trim()) {
          clientHistory.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
        }
      }
    }
  }

  return {
    history: uiHistory,
    clientHistory,
    type: 'load_history',
  };
}
