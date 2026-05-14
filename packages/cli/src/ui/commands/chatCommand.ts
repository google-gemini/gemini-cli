/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  type SlashCommand,
  type CommandContext,
  CommandKind,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType, type HistoryItemWithoutId } from '../types.js';
import { exportHistoryToFile } from '../utils/historyExportUtils.js';
import { INITIAL_HISTORY_LENGTH } from '@google/gemini-cli-core';

const baseChatSubCommands: SlashCommand[] = [
  {
    name: 'list',
    description: 'List saved conversation checkpoints',
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext): Promise<void> => {
      const logger = context.services.logger;
      await logger.initialize();
      const geminiDir =
        context.services.agentContext?.config.storage.getProjectTempDir();
      if (!geminiDir) {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: 'Error: Could not determine project directory.',
        });
        return;
      }

      try {
        const files = await fs.readdir(geminiDir);
        const checkpoints = await Promise.all(
          files
            .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.json'))
            .map(async (f) => {
              const name = f.replace(/^checkpoint-/, '').replace(/\.json$/, '');
              const stats = await fs.stat(path.join(geminiDir, f));
              return {
                name,
                mtime: stats.mtime.toISOString(),
              };
            }),
        );

        const chatListItem: HistoryItemWithoutId = {
          type: 'chat_list',
          chats: checkpoints.sort(
            (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
          ),
        };
        context.ui.addItem(chatListItem);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `Error listing checkpoints: ${errorMessage}`,
        });
      }
    },
  },
  {
    name: 'save',
    description: 'Save a named checkpoint of the current conversation',
    kind: CommandKind.BUILT_IN,
    action: async (
      context: CommandContext,
      args?: string,
    ): Promise<SlashCommandActionReturn | void> => {
      const tag = (args || '').trim();
      if (!tag) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Missing tag. Usage: /resume save <tag>',
        };
      }

      const agentContext = context.services.agentContext;
      const chat = agentContext?.geminiClient?.getChat();
      const history = chat?.getHistory() || [];

      // Simple heuristic: don't save if there's only system context or no history.
      if (history.length <= INITIAL_HISTORY_LENGTH) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No conversation found to save.',
        };
      }

      const logger = context.services.logger;
      await logger.initialize();

      if (!context.overwriteConfirmed && (await logger.checkpointExists(tag))) {
        return {
          type: 'confirm_action',
          prompt: `Checkpoint '${tag}' already exists. Overwrite?`,
          originalInvocation: context.invocation!,
        };
      }

      const authType =
        agentContext?.config.getContentGeneratorConfig()?.authType;
      const trajectories = await chat?.getSubagentTrajectories();
      const messages = chat?.getConversation()?.messages ?? [];
      await logger.saveCheckpoint(
        { version: '2.0', authType, trajectories, messages },
        tag,
      );

      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint saved with tag: ${tag}.`,
      };
    },
  },
  {
    name: 'resume',
    description: 'Resume a saved conversation checkpoint',
    kind: CommandKind.BUILT_IN,
    completion: async (context: CommandContext, input: string) => {
      const geminiDir =
        context.services.agentContext?.config.storage.getProjectTempDir();
      if (!geminiDir) return [];
      try {
        const files = await fs.readdir(geminiDir);
        const checkpoints = await Promise.all(
          files
            .filter(
              (f) =>
                f.startsWith('checkpoint-') &&
                f.endsWith('.json') &&
                f.toLowerCase().includes(input.toLowerCase()),
            )
            .map(async (f) => {
              const stats = await fs.stat(path.join(geminiDir, f));
              return {
                name: f.replace(/^checkpoint-/, '').replace(/\.json$/, ''),
                mtime: stats.mtime.getTime(),
              };
            }),
        );
        return checkpoints.sort((a, b) => b.mtime - a.mtime).map((c) => c.name);
      } catch {
        return [];
      }
    },
    action: async (
      context: CommandContext,
      args?: string,
    ): Promise<SlashCommandActionReturn | void> => {
      const tag = (args || '').trim();
      if (!tag) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Missing tag. Usage: /resume resume <tag>',
        };
      }

      const logger = context.services.logger;
      await logger.initialize();
      const checkpoint = await logger.loadCheckpoint(tag);

      if (!checkpoint.history || checkpoint.history.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: `No saved checkpoint found with tag: ${tag}.`,
        };
      }

      const currentAuthType =
        context.services.agentContext?.config.getContentGeneratorConfig()
          ?.authType;
      if (
        checkpoint.authType &&
        currentAuthType &&
        checkpoint.authType !== currentAuthType
      ) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Cannot resume chat. It was saved with a different authentication method (${checkpoint.authType}) than the current one (${currentAuthType}).`,
        };
      }

      // Return the load_history action which UI hooks handle
      return {
        type: 'load_history',
        // Strip the "System Setup" turns which are re-added during startChat/resumeChat
        history: checkpoint.history.slice(INITIAL_HISTORY_LENGTH).map((h) => ({
          type: h.role === 'user' ? 'user' : 'gemini',
          text:
            h.parts
              ?.map((p) => p.text)
              .filter(Boolean)
              .join('\n') || '',
        })),
        clientHistory: checkpoint.history,
        messages: checkpoint.messages,
        version: checkpoint.version,
      };
    },
  },
  {
    name: 'delete',
    description: 'Delete a saved conversation checkpoint',
    kind: CommandKind.BUILT_IN,
    completion: async (context: CommandContext, input: string) => {
      // Reuse the logic from resume completion
      const resumeCmd = baseChatSubCommands.find((c) => c.name === 'resume');
      return (await resumeCmd?.completion?.(context, input)) || [];
    },
    action: async (
      context: CommandContext,
      args?: string,
    ): Promise<SlashCommandActionReturn | void> => {
      const tag = (args || '').trim();
      if (!tag) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Missing tag. Usage: /resume delete <tag>',
        };
      }

      const logger = context.services.logger;
      await logger.initialize();
      const deleted = await logger.deleteCheckpoint(tag);

      if (!deleted) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Error: No checkpoint found with tag '${tag}'.`,
        };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint '${tag}' has been deleted.`,
      };
    },
  },
  {
    name: 'share',
    description: 'Export current conversation history to a file',
    kind: CommandKind.BUILT_IN,
    action: async (
      context: CommandContext,
      args?: string,
    ): Promise<SlashCommandActionReturn | void> => {
      const agentContext = context.services.agentContext;
      const chat = agentContext?.geminiClient?.getChat();
      const history = chat?.getHistory() || [];

      // Simple heuristic: don't share if there's only system context or no history.
      if (history.length <= INITIAL_HISTORY_LENGTH) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No conversation found to share.',
        };
      }

      let filePath = (args || '').trim();
      if (!filePath) {
        filePath = `gemini-conversation-${Date.now()}.json`;
      }

      const extension = path.extname(filePath).toLowerCase();
      if (extension !== '.json' && extension !== '.md') {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Invalid file format. Only .md and .json are supported.',
        };
      }

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

      try {
        const trajectories = await chat?.getSubagentTrajectories();
        const messages = chat?.getConversation()?.messages ?? [];
        await exportHistoryToFile({
          messages,
          filePath: absolutePath,
          trajectories,
          history,
        });

        return {
          type: 'message',
          messageType: 'info',
          content: `Conversation shared to ${absolutePath}`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          type: 'message',
          messageType: 'error',
          content: `Error sharing conversation: ${errorMessage}`,
        };
      }
    },
  },
];

export const chatResumeSubCommands: SlashCommand[] = [
  ...baseChatSubCommands,
  {
    name: 'checkpoints',
    description: 'List saved conversation checkpoints (legacy alias)',
    kind: CommandKind.BUILT_IN,
    hidden: true,
    subCommands: baseChatSubCommands,
  },
];

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: 'Browse auto-saved conversations and manage chat checkpoints',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: chatResumeSubCommands,
};

export const debugCommand: SlashCommand = {
  name: 'debug',
  description: 'Export the last API request and response for debugging',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.agentContext?.config;
    const lastRequest = config?.getLatestApiRequest?.();

    if (!lastRequest) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No recent API request found to export.',
      };
    }

    const fileName = `gcli-request-${Date.now()}.json`;
    const absolutePath = path.join(process.cwd(), fileName);

    try {
      await fs.writeFile(absolutePath, JSON.stringify(lastRequest, null, 2));
      return {
        type: 'message',
        messageType: 'info',
        content: `Debug API request saved to ${fileName}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        type: 'message',
        messageType: 'error',
        content: `Error saving debug request: ${errorMessage}`,
      };
    }
  },
};
