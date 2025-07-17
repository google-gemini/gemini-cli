/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import {
  CommandContext,
  SlashCommand,
  MessageActionReturn,
  LoadHistoryActionReturn,
} from './types.js';
import { HistoryItemWithoutId, MessageType } from '../types.js';

interface ConversationData {
  startTime: string;
  lastUpdated: string;
  messages: Array<{
    type: string;
    content: string;
    timestamp: string;
  }>;
}

interface SessionInfo {
  file: string;
  startTime: string;
  messageCount: number;
  lastUpdated: string;
}

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List auto-saved conversations',
  action: async (context: CommandContext): Promise<MessageActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const chatsDir = path.join(config.getProjectTempDir(), 'chats');

    try {
      const files = await fs.readdir(chatsDir);
      const chatFiles = files.filter((f) => f.endsWith('.json'));

      if (chatFiles.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No auto-saved conversations found.',
        };
      }

      // Read metadata from each file
      const sessions = await Promise.all(
        chatFiles.map(async (file) => {
          const filePath = path.join(chatsDir, file);
          try {
            const data: ConversationData = JSON.parse(
              await fs.readFile(filePath, 'utf8'),
            );
            return {
              file: file.replace('.json', ''),
              startTime: data.startTime,
              messageCount: data.messages.length,
              lastUpdated: data.lastUpdated,
            };
          } catch {
            return null;
          }
        }),
      );

      const validSessions = sessions.filter(
        (s): s is SessionInfo => s !== null,
      );
      const list = validSessions
        .sort(
          (a, b) =>
            new Date(b.lastUpdated).getTime() -
            new Date(a.lastUpdated).getTime(),
        )
        .map(
          (s) =>
            `${s.file} (${s.messageCount} messages, ${new Date(
              s.startTime,
            ).toLocaleString()})`,
        )
        .join('\n');

      return {
        type: 'message',
        messageType: 'info',
        content: `Auto-saved conversations:\n${list}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error listing conversations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};

const resumeCommand: SlashCommand = {
  name: 'resume',
  description:
    'Resume an auto-saved conversation. Usage: /chat resume <session-id>',
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn | LoadHistoryActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const sessionId = args?.trim();
    if (!sessionId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing session ID. Usage: /chat resume <session-id>',
      };
    }

    try {
      const chatsDir = path.join(config.getProjectTempDir(), 'chats');
      const filePath = path.join(chatsDir, `${sessionId}.json`);
      const conversation: ConversationData = JSON.parse(
        await fs.readFile(filePath, 'utf8'),
      );

      // Convert to UI history format
      const uiHistory: HistoryItemWithoutId[] = conversation.messages.map(
        (msg) => ({
          type: msg.type === 'user' ? MessageType.USER : MessageType.GEMINI,
          text: msg.content,
        }),
      );

      // Convert to Gemini client history format
      const clientHistory = conversation.messages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      return {
        type: 'load_history',
        history: uiHistory,
        clientHistory,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error resuming conversation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
  completion: async (
    context: CommandContext,
    partialArg: string,
  ): Promise<string[]> => {
    const { config } = context.services;
    if (!config) return [];

    try {
      const chatsDir = path.join(config.getProjectTempDir(), 'chats');
      const files = await fs.readdir(chatsDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .filter((sessionId) => sessionId.startsWith(partialArg));
    } catch {
      return [];
    }
  },
};

const searchCommand: SlashCommand = {
  name: 'search',
  description: 'Search auto-saved conversations. Usage: /chat search <text>',
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const query = args?.trim();
    if (!query) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing search query. Usage: /chat search <text>',
      };
    }

    try {
      const chatsDir = path.join(config.getProjectTempDir(), 'chats');
      const files = await fs.readdir(chatsDir);
      const results = [];

      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const filePath = path.join(chatsDir, file);
        try {
          const conversation: ConversationData = JSON.parse(
            await fs.readFile(filePath, 'utf8'),
          );

          const matchingMessages = conversation.messages.filter((msg) =>
            msg.content.toLowerCase().includes(query.toLowerCase()),
          );

          if (matchingMessages.length > 0) {
            results.push({
              session: file.replace('.json', ''),
              matches: matchingMessages.length,
              startTime: conversation.startTime,
            });
          }
        } catch {
          // Skip invalid files
        }
      }

      if (results.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: `No conversations found containing "${query}".`,
        };
      } else {
        const resultText = results
          .map(
            (r) =>
              `${r.session}: ${r.matches} matches (${new Date(
                r.startTime,
              ).toLocaleString()})`,
          )
          .join('\n');

        return {
          type: 'message',
          messageType: 'info',
          content: `Found "${query}" in:\n${resultText}`,
        };
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error searching conversations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description:
    'Browse auto-saved conversations. Usage: /chat <list|resume|search>',
  subCommands: [listCommand, resumeCommand, searchCommand],
};
