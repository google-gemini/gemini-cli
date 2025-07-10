/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { CommandContext, SlashCommand, MessageActionReturn } from './types.js';
import { HistoryItemWithoutId, MessageType } from '../types.js';

// Helper function to get saved chat tags.
// This logic was previously inside the useSlashCommandProcessor hook.
const getSavedChatTags = async (context: CommandContext): Promise<string[]> => {
  const geminiDir = context.services.config?.getProjectTempDir();
  if (!geminiDir) {
    return [];
  }
  try {
    const files = await fs.readdir(geminiDir);
    return files
      .filter(
        (file) => file.startsWith('checkpoint-') && file.endsWith('.json'),
      )
      .map((file) => file.replace('checkpoint-', '').replace('.json', ''));
  } catch (_err) {
    return [];
  }
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List saved conversation checkpoints',
  action: async (context): Promise<MessageActionReturn> => {
    const tags = await getSavedChatTags(context);
    if (tags.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No saved conversation checkpoints found.',
      };
    }
    return {
      type: 'message',
      messageType: 'info',
      content: 'List of saved conversations: ' + tags.join(', '),
    };
  },
};

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save the current conversation as a checkpoint. Usage: /chat save <tag>',
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
  altName: 'load',
  description:
    'Resume a conversation from a checkpoint. Usage: /chat resume <tag>',
  action: async (context, args) => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat resume <tag>',
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();
    const conversation = await logger.loadCheckpoint(tag);

    if (conversation.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: `No saved checkpoint found with tag: ${tag}.`,
      };
    }

    const chat = await config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No chat client available to resume conversation.',
      };
    }

    // This part of the logic directly manipulates the UI and history state,
    // which is not ideal for a command to do directly.
    // For now, we will keep it, but a better approach would be to
    // return a specific action type that the UI layer can handle.
    // TODO: Refactor this to return a "load_history" action.
    context.ui.clear();
    chat.clearHistory();

    const rolemap: { [key: string]: MessageType } = {
      user: MessageType.USER,
      model: MessageType.GEMINI,
    };

    let hasSystemPrompt = false;
    let i = 0;
    for (const item of conversation) {
      i += 1;
      chat.addHistory(item);

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
        context.ui.addItem(
          {
            type: (item.role && rolemap[item.role]) || MessageType.GEMINI,
            text,
          } as HistoryItemWithoutId,
          i,
        );
      }
    }
  },
  completion: async (context) => {
    const tags = await getSavedChatTags(context);
    return tags;
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: 'Manage conversation history',
  subCommands: [listCommand, saveCommand, resumeCommand],
};
