/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'fs/promises';
import {
  CommandContext,
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import path from 'path';
import { HistoryItemWithoutId, MessageType } from '../types.js';
import { ConversationLogger } from '../../services/ConversationLogger.js';

// Initialize conversation logger
const conversationLogger = new ConversationLogger();
await conversationLogger.init();

interface ChatDetail {
  name: string;
  mtime: Date;
}

const getSavedChatTags = async (
  context: CommandContext,
  mtSortDesc: boolean,
): Promise<ChatDetail[]> => {
  const geminiDir = context.services.config?.getProjectTempDir();
  if (!geminiDir) {
    return [];
  }
  try {
    const file_head = 'checkpoint-';
    const file_tail = '.json';
    const files = await fsPromises.readdir(geminiDir);
    const chatDetails: Array<{ name: string; mtime: Date }> = [];

    for (const file of files) {
      if (file.startsWith(file_head) && file.endsWith(file_tail)) {
        const filePath = path.join(geminiDir, file);
        const stats = await fsPromises.stat(filePath);
        chatDetails.push({
          name: file.slice(file_head.length, -file_tail.length),
          mtime: stats.mtime,
        });
      }
    }

    chatDetails.sort((a, b) =>
      mtSortDesc
        ? b.mtime.getTime() - a.mtime.getTime()
        : a.mtime.getTime() - b.mtime.getTime(),
    );

    return chatDetails;
  } catch (_err) {
    return [];
  }
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List saved conversation checkpoints',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const chatDetails = await getSavedChatTags(context, false);
    if (chatDetails.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No saved conversation checkpoints found.',
      };
    }

    const maxNameLength = Math.max(
      ...chatDetails.map((chat) => chat.name.length),
    );

    let message = 'List of saved conversations:\n\n';
    for (const chat of chatDetails) {
      const paddedName = chat.name.padEnd(maxNameLength, ' ');
      const isoString = chat.mtime.toISOString();
      const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      const formattedDate = match ? `${match[1]} ${match[2]}` : 'Invalid Date';
      message += `  - \u001b[36m${paddedName}\u001b[0m  \u001b[90m(saved on ${formattedDate})\u001b[0m\n`;
    }
    message += `\n\u001b[90mNote: Newest last, oldest first\u001b[0m`;
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save the current conversation as a checkpoint. Usage: /chat save <tag>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat save <tag>',
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();
    const chat = await config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No chat client available to save conversation.',
      };
    }

    const history = chat.getHistory();
    if (history.length > 0) {
      await logger.saveCheckpoint(history, tag);
      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint saved with tag: ${tag}.`,
      };
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to save.',
      };
    }
  },
};

const resumeCommand: SlashCommand = {
  name: 'resume',
  altNames: ['load'],
  description:
    'Resume a conversation from a checkpoint. Usage: /chat resume <tag>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat resume <tag>',
      };
    }

    const { logger } = context.services;
    await logger.initialize();
    const conversation = await logger.loadCheckpoint(tag);

    if (conversation.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: `No saved checkpoint found with tag: ${tag}.`,
      };
    }

    const rolemap: { [key: string]: MessageType } = {
      user: MessageType.USER,
      model: MessageType.GEMINI,
    };

    const uiHistory: HistoryItemWithoutId[] = [];
    let hasSystemPrompt = false;
    let i = 0;

    for (const item of conversation) {
      i += 1;
      const text =
        item.parts
          ?.filter((m) => !!m.text)
          .map((m) => m.text)
          .join('') || '';
      if (!text) {
        continue;
      }
      if (i === 1 && text.match(/context for our chat/)) {
        hasSystemPrompt = true;
      }
      if (i > 2 || !hasSystemPrompt) {
        uiHistory.push({
          type: (item.role && rolemap[item.role]) || MessageType.GEMINI,
          text,
        } as HistoryItemWithoutId);
      }
    }
    return {
      type: 'load_history',
      history: uiHistory,
      clientHistory: conversation,
    };
  },
  completion: async (context, partialArg) => {
    const chatDetails = await getSavedChatTags(context, true);
    return chatDetails
      .map((chat) => chat.name)
      .filter((name) => name.startsWith(partialArg));
  },
};

const deleteCommand: SlashCommand = {
  name: 'delete',
  description: 'Delete a conversation checkpoint. Usage: /chat delete <tag>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat delete <tag>',
      };
    }

    const { logger } = context.services;
    await logger.initialize();
    const deleted = await logger.deleteCheckpoint(tag);

    if (deleted) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint '${tag}' has been deleted.`,
      };
    } else {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error: No checkpoint found with tag '${tag}'.`,
      };
    }
  },
  completion: async (context, partialArg) => {
    const chatDetails = await getSavedChatTags(context, true);
    return chatDetails
      .map((chat) => chat.name)
      .filter((name) => name.startsWith(partialArg));
  },
};

const logShowCommand: SlashCommand = {
  name: 'log show',
  description: 'Show conversation logs',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    try {
      const limit = args[0] ? parseInt(args[0], 10) : 10;
      if (isNaN(limit) || limit <= 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Please provide a valid positive number for the log limit.',
        };
      }

      const logs = await conversationLogger.getLogs(limit);
      
      if (logs.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No conversation logs found.',
        };
      }

      const logEntries = logs.map((log, index) => {
        const date = new Date(log.timestamp).toLocaleString();
        return `[${index + 1}] ${date} | ${log.model}\n` +
               `  Prompt: ${log.prompt}\n` +
               `  Response: ${log.textResponse.substring(0, 100)}${log.textResponse.length > 100 ? '...' : ''}`;
      }).join('\n\n');

      return {
        type: 'message',
        messageType: 'info',
        content: `## Conversation Logs (showing ${logs.length} most recent):\n\n${logEntries}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error retrieving logs: ${(error as Error).message}`,      };
    }
  },
};

const logClearCommand: SlashCommand = {
  name: 'log clear',
  description: 'Clear all conversation logs',
  kind: CommandKind.BUILT_IN,
  async action(): Promise<MessageActionReturn> {
    try {
      await conversationLogger.clearLogs();
      return {
        type: 'message',
        messageType: 'info',
        content: 'All conversation logs have been cleared.'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: 'message',
        messageType: 'error',
        content: `Error clearing logs: ${errorMessage}`
      };
    }
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: 'Manage conversation history.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    listCommand,
    saveCommand,
    resumeCommand,
    deleteCommand,
    logShowCommand,
    logClearCommand,
  ],
  async action(context, args): Promise<MessageActionReturn> {
    try {
      // Handle args which could be string or string[]
      const prompt = Array.isArray(args) ? args.join(' ') : args || '';
      
      if (!prompt) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'Please provide a message to chat with Gemini.'
        };
      }

      // Safely get model from config with type checking
      const model = (context.services.config && 
                    typeof context.services.config.get === 'function') 
        ? (context.services.config.get('model') as string) 
        : 'default-model';
      
      if (context.services.chat) {
        const response = await context.services.chat.sendMessage(prompt);
        
        // Log the conversation
        await conversationLogger.log({
          model,
          prompt,
          textResponse: typeof response === 'string' ? response : JSON.stringify(response),
          fullResponse: response
        });
        
        return {
          type: 'message',
          messageType: 'info',
          content: typeof response === 'string' ? response : JSON.stringify(response, null, 2)
        };
      } else {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Chat service is not available.'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: 'message',
        messageType: 'error',
        content: `Error processing message: ${errorMessage}`
      };
    }
  },
};
