/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { Config } from '@google/gemini-cli-core';
import { LoadHistoryActionReturn } from '../commands/types.js';
import { HistoryItemWithoutId, MessageType, ToolCallStatus } from '../types.js';
import { ChatRecordingService } from '@google/gemini-cli-core';
import * as fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

interface ConversationData {
  startTime: string;
  lastUpdated: string;
  messages: Array<{
    type: string;
    content: string;
    timestamp: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: any;
      result: any;
      status: string;
      timestamp: string;
      displayName?: string;
      description?: string;
      resultDisplay?: string;
      renderOutputAsMarkdown?: boolean;
    }>;
  }>;
}

export const useSessionBrowser = (
  config: Config,
  chatRecordingService: ChatRecordingService,
  onLoadHistory: (result: LoadHistoryActionReturn) => void,
) => {
  const [isSessionBrowserOpen, setIsSessionBrowserOpen] = useState(false);

  const openSessionBrowser = useCallback(() => {
    setIsSessionBrowserOpen(true);
  }, []);

  const closeSessionBrowser = useCallback(() => {
    setIsSessionBrowserOpen(false);
  }, []);

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      try {
        const chatsDir = path.join(config.getProjectTempDir(), 'chats');
        const originalFilePath = path.join(chatsDir, `${sessionId}.json`);

        // Generate new session ID for the duplicate
        const newSessionId = randomUUID();

        // Update config with new session ID
        config.setSessionId(newSessionId);

        // Reinitialize ChatRecordingService with the duplicated session
        chatRecordingService.reinitializeWithSession(
          newSessionId,
          originalFilePath,
        );

        const conversation: ConversationData = JSON.parse(
          await fs.readFile(originalFilePath, 'utf8'),
        );

        // Convert to UI history format
        const uiHistory: HistoryItemWithoutId[] = [];

        for (const msg of conversation.messages) {
          if (msg.content == '/resume') {
            continue;
          }

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

          // Add tool calls if present (they come after assistant responses)
          if (
            msg.type !== 'user' &&
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
        const clientHistory = conversation.messages.map((msg) => ({
          role: msg.type === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        }));

        // Close the browser and load the history
        setIsSessionBrowserOpen(false);
        onLoadHistory({
          type: 'load_history',
          history: uiHistory,
          clientHistory,
        });
      } catch (error) {
        console.error('Error resuming session:', error);
        // For now, just close the browser on error
        setIsSessionBrowserOpen(false);
      }
    },
    [config, chatRecordingService, onLoadHistory],
  );

  return {
    isSessionBrowserOpen,
    openSessionBrowser,
    closeSessionBrowser,
    handleResumeSession,
  };
};
