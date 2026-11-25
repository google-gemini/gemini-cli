/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertSessionToClientHistory,
  hasResumableConversationContent,
  type MessageActionReturn,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

interface ParsedForkArgs {
  stay: boolean;
  name?: string;
}

export function parseForkArgs(args: string): ParsedForkArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let stay = false;
  const nameParts: string[] = [];

  for (const token of tokens) {
    if (token === '--stay') {
      stay = true;
    } else {
      nameParts.push(token);
    }
  }

  const name = nameParts.join(' ').trim();
  return {
    stay,
    name: name.length > 0 ? name : undefined,
  };
}

export const forkCommand: SlashCommand = {
  name: 'fork',
  description:
    'Fork the current conversation into a new session. Usage: /fork [name] [--stay]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  argumentHint: '[name] [--stay]',
  showCompletionLoading: false,
  completion: (_context, partialArg) => {
    const trimmed = partialArg.trim();
    if (trimmed.startsWith('-') && '--stay'.startsWith(trimmed)) {
      return ['--stay'];
    }
    return [];
  },
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found.',
      };
    }

    const client = agentContext.geminiClient;
    if (!client) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Client not initialized.',
      };
    }

    const recordingService = client.getChatRecordingService();
    if (!recordingService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Chat recording service is unavailable.',
      };
    }

    const { stay, name } = parseForkArgs(args);

    try {
      const currentConversation = recordingService.getConversationAsync
        ? await recordingService.getConversationAsync()
        : recordingService.getConversation();

      if (
        !currentConversation ||
        !hasResumableConversationContent(currentConversation.messages)
      ) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No conversation found to fork.',
        };
      }

      const forkResult = await recordingService.forkAsync({ summary: name });
      if (!forkResult) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Failed to fork conversation.',
        };
      }

      const labelSuffix = forkResult.conversation.summary
        ? ` (${forkResult.conversation.summary})`
        : '';

      if (stay) {
        return {
          type: 'message',
          messageType: 'info',
          content:
            `Forked session${labelSuffix}: ${forkResult.sessionId}\n` +
            `Staying on current session. Resume the fork with:\n` +
            `  gemini --resume ${forkResult.sessionId}\n` +
            `Or select it from /resume.`,
        };
      }

      const clientHistory = convertSessionToClientHistory(
        forkResult.conversation.messages,
      );
      await client.resumeChat(clientHistory, {
        conversation: forkResult.conversation,
        filePath: forkResult.filePath,
      });
      config.setSessionId(forkResult.sessionId);

      return {
        type: 'message',
        messageType: 'info',
        content:
          `Forked and switched to new session${labelSuffix}: ${forkResult.sessionId}\n` +
          `Original session preserved. Resume it anytime with:\n` +
          `  gemini --resume ${forkResult.sourceSessionId}\n` +
          `Or select it from /resume.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to fork conversation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
