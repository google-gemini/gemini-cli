/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandContext, SlashCommand, MessageActionReturn } from './types.js';
import {
  conversationToMarkdown,
  conversationToJsonL,
  historyToConversation,
  contentToHistory,
} from './exportConversation.js';
import * as fs from 'fs';

const exportAction = async (
  context: CommandContext,
  args: string,
  format: 'jsonl' | 'markdown',
): Promise<MessageActionReturn> => {
  const chat = await context.services.config?.getGeminiClient()?.getChat();
  if (!chat) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'No chat client available to export conversation.',
    };
  }

  const history = chat.getHistory();
  if (history.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No conversation found to export.',
    };
  }

  const conversation = historyToConversation(contentToHistory(history));
  let content: string;
  if (format === 'jsonl') {
    content = conversationToJsonL(conversation);
  } else {
    content = conversationToMarkdown(conversation);
  }

  const outputFlag = '--output';
  const argParts = args.split(' ').filter(Boolean); // Split by space and remove empty strings
  const outputIndex = argParts.indexOf(outputFlag);
  let outputPath: string | undefined;

  if (outputIndex !== -1 && outputIndex + 1 < argParts.length) {
    outputPath = argParts[outputIndex + 1];
  }

  if (outputPath) {
    try {
      fs.writeFileSync(outputPath, content);
      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation exported to ${outputPath}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Error writing to file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else {
    process.stdout.write(content);
    return {
      type: 'message',
      messageType: 'info',
      content: 'Conversation printed to console.',
    };
  }
};

const jsonlCommand: SlashCommand = {
  name: 'jsonl',
  description: 'Export the conversation to JSONL. Defaults to console output.',
  action: (context, args) => exportAction(context, args, 'jsonl'),
};

const markdownCommand: SlashCommand = {
  name: 'markdown',
  description:
    'Export the conversation to Markdown. Defaults to console output.',
  action: (context, args) => exportAction(context, args, 'markdown'),
};

export const exportConversationCommand: SlashCommand = {
  name: 'export',
  description:
    'Export the conversation. Use the `--output <file_path>` flag to save to a file.',
  subCommands: [jsonlCommand, markdownCommand],
};
