/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'node:fs/promises';
import React from 'react';
import { Text } from 'ink';
import { t } from '../../i18n/index.js';
import { theme } from '../semantic-colors.js';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  decodeTagName,
  type MessageActionReturn,
  INITIAL_HISTORY_LENGTH,
} from '@google/gemini-cli-core';
import path from 'node:path';
import type {
  HistoryItemWithoutId,
  HistoryItemChatList,
  ChatDetail,
} from '../types.js';
import { MessageType } from '../types.js';
import { exportHistoryToFile } from '../utils/historyExportUtils.js';
import { convertToRestPayload } from '@google/gemini-cli-core';

const getSavedChatTags = async (
  context: CommandContext,
  mtSortDesc: boolean,
): Promise<ChatDetail[]> => {
  const cfg = context.services.config;
  const geminiDir = cfg?.storage?.getProjectTempDir();
  if (!geminiDir) {
    return [];
  }
  try {
    const file_head = 'checkpoint-';
    const file_tail = '.json';
    const files = await fsPromises.readdir(geminiDir);
    const chatDetails: ChatDetail[] = [];

    for (const file of files) {
      if (file.startsWith(file_head) && file.endsWith(file_tail)) {
        const filePath = path.join(geminiDir, file);
        const stats = await fsPromises.stat(filePath);
        const tagName = file.slice(file_head.length, -file_tail.length);
        chatDetails.push({
          name: decodeTagName(tagName),
          mtime: stats.mtime.toISOString(),
        });
      }
    }

    chatDetails.sort((a, b) =>
      mtSortDesc
        ? b.mtime.localeCompare(a.mtime)
        : a.mtime.localeCompare(b.mtime),
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
  autoExecute: true,
  action: async (context): Promise<void> => {
    const chatDetails = await getSavedChatTags(context, false);

    const item: HistoryItemChatList = {
      type: MessageType.CHAT_LIST,
      chats: chatDetails,
    };

    context.ui.addItem(item);
  },
};

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save the current conversation as a checkpoint. Usage: /chat save <tag>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context, args): Promise<SlashCommandActionReturn | void> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.missingTagSave'),
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();

    if (!context.overwriteConfirmed) {
      const exists = await logger.checkpointExists(tag);
      if (exists) {
        return {
          type: 'confirm_action',
          prompt: React.createElement(
            Text,
            null,
            t('commands:chat.responses.overwriteConfirmPrefix'),
            React.createElement(Text, { color: theme.text.accent }, tag),
            t('commands:chat.responses.overwriteConfirmSuffix'),
          ),
          originalInvocation: {
            raw: context.invocation?.raw || `/chat save ${tag}`,
          },
        };
      }
    }

    const chat = config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.noClient'),
      };
    }

    const history = chat.getHistory();
    if (history.length > INITIAL_HISTORY_LENGTH) {
      const authType = config?.getContentGeneratorConfig()?.authType;
      await logger.saveCheckpoint({ history, authType }, tag);
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.saveSuccess', {
          tag: decodeTagName(tag),
        }),
      };
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.noChatToSave'),
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
  autoExecute: true,
  action: async (context, args) => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.missingTagResume'),
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();
    const checkpoint = await logger.loadCheckpoint(tag);
    const conversation = checkpoint.history;

    if (conversation.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.notFound', {
          tag: decodeTagName(tag),
        }),
      };
    }

    const currentAuthType = config?.getContentGeneratorConfig()?.authType;
    if (
      checkpoint.authType &&
      currentAuthType &&
      checkpoint.authType !== currentAuthType
    ) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.authMismatch', {
          old: checkpoint.authType,
          new: currentAuthType,
        }),
      };
    }

    const rolemap: { [key: string]: MessageType } = {
      user: MessageType.USER,
      model: MessageType.GEMINI,
    };

    const uiHistory: HistoryItemWithoutId[] = [];

    for (const item of conversation.slice(INITIAL_HISTORY_LENGTH)) {
      const text =
        item.parts
          ?.filter((m) => !!m.text)
          .map((m) => m.text)
          .join('') || '';
      if (!text) {
        continue;
      }

      uiHistory.push({
        type: (item.role && rolemap[item.role]) || MessageType.GEMINI,
        text,
      } as HistoryItemWithoutId);
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
  autoExecute: true,
  action: async (context, args): Promise<MessageActionReturn> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.missingTagDelete'),
      };
    }

    const { logger } = context.services;
    await logger.initialize();
    const deleted = await logger.deleteCheckpoint(tag);

    if (deleted) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.deleteSuccess', {
          tag: decodeTagName(tag),
        }),
      };
    } else {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.deleteError', {
          tag: decodeTagName(tag),
        }),
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

const shareCommand: SlashCommand = {
  name: 'share',
  description:
    'Share the current conversation to a markdown or json file. Usage: /chat share <file>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context, args): Promise<MessageActionReturn> => {
    let filePathArg = args.trim();
    if (!filePathArg) {
      filePathArg = `gemini-conversation-${Date.now()}.json`;
    }

    const filePath = path.resolve(filePathArg);
    const extension = path.extname(filePath);
    if (extension !== '.md' && extension !== '.json') {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.invalidFormat'),
      };
    }

    const chat = context.services.config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.noClientShare'),
      };
    }

    const history = chat.getHistory();

    // An empty conversation has a hidden message that sets up the context for
    // the chat. Thus, to check whether a conversation has been started, we
    // can't check for length 0.
    if (history.length <= INITIAL_HISTORY_LENGTH) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.noChatToShare'),
      };
    }

    try {
      await exportHistoryToFile({ history, filePath });
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.shareSuccess', { path: filePath }),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.shareError', {
          error: errorMessage,
        }),
      };
    }
  },
};

export const debugCommand: SlashCommand = {
  name: 'debug',
  description: 'Export the most recent API request as a JSON payload',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context): Promise<MessageActionReturn> => {
    const req = context.services.config?.getLatestApiRequest();
    if (!req) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.noRequest'),
      };
    }

    const restPayload = convertToRestPayload(req);
    const filename = `gcli-request-${Date.now()}.json`;
    const filePath = path.join(process.cwd(), filename);

    try {
      await fsPromises.writeFile(
        filePath,
        JSON.stringify(restPayload, null, 2),
      );
      return {
        type: 'message',
        messageType: 'info',
        content: t('commands:chat.responses.debugSaveSuccess', {
          file: filename,
        }),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:chat.responses.debugSaveError', {
          error: errorMessage,
        }),
      };
    }
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: 'Manage conversation history',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    listCommand,
    saveCommand,
    resumeCommand,
    deleteCommand,
    shareCommand,
  ],
};
