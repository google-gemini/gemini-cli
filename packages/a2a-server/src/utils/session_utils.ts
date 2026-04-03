/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GeminiClient,
  ConversationRecord,
  ResumedSessionData,
  MessageRecord,
} from '@google/gemini-cli-core';
import {
  isNodeError,
  partListUnionToString,
  SESSION_FILE_PREFIX,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Content, Part, PartListUnion } from '@google/genai';
import { logger } from './logger.js';

/**
 * Converts a PartListUnion into a normalized array of Part objects.
 * This handles converting raw strings into { text: string } parts.
 */
function ensurePartArray(content: PartListUnion): Part[] {
  if (Array.isArray(content)) {
    return content.map((part) =>
      typeof part === 'string' ? { text: part } : part,
    );
  }
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return [content];
}

function isConversationRecord(value: unknown): value is ConversationRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ConversationRecord>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.projectHash === 'string' &&
    typeof candidate.startTime === 'string' &&
    typeof candidate.lastUpdated === 'string' &&
    Array.isArray(candidate.messages)
  );
}

/**
 * Convert MessageRecord[] from a ConversationRecord into Gemini Content[] format.
 * This is the a2a-server equivalent of CLI's convertSessionToHistoryFormats,
 * producing only the clientHistory (no UI history needed).
 *
 * Handles:
 * - user messages (text + file parts)
 * - gemini messages with tool calls (functionCall + functionResponse pairing)
 * - gemini messages without tool calls (plain text)
 * - skips system messages (info/error/warning) and slash commands
 */
export function convertMessagesToClientHistory(
  messages: MessageRecord[],
): Content[] {
  const clientHistory: Content[] = [];

  for (const msg of messages) {
    if (msg.type === 'info' || msg.type === 'error' || msg.type === 'warning') {
      continue;
    }

    if (msg.type === 'user') {
      const contentString = partListUnionToString(msg.content);
      if (
        contentString.trim().startsWith('/') ||
        contentString.trim().startsWith('?')
      ) {
        continue;
      }

      clientHistory.push({
        role: 'user',
        parts: ensurePartArray(msg.content),
      });
    } else if (msg.type === 'gemini') {
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

      if (hasToolCalls) {
        const modelParts: Part[] = [];

        if (msg.content) {
          modelParts.push(...ensurePartArray(msg.content));
        }

        for (const toolCall of msg.toolCalls!) {
          modelParts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
              ...(toolCall.id && { id: toolCall.id }),
            },
          });
        }

        if (modelParts.length > 0) {
          clientHistory.push({ role: 'model', parts: modelParts });
        }

        const functionResponseParts: Part[] = [];
        for (const toolCall of msg.toolCalls!) {
          if (toolCall.result) {
            if (typeof toolCall.result === 'string') {
              functionResponseParts.push({
                functionResponse: {
                  id: toolCall.id,
                  name: toolCall.name,
                  response: { output: toolCall.result },
                },
              });
            } else if (Array.isArray(toolCall.result)) {
              functionResponseParts.push(...ensurePartArray(toolCall.result));
            } else {
              functionResponseParts.push(toolCall.result);
            }
          }
        }

        if (functionResponseParts.length > 0) {
          clientHistory.push({ role: 'user', parts: functionResponseParts });
        }
      } else {
        if (msg.content) {
          const modelParts = ensurePartArray(msg.content);
          if (modelParts.length > 0) {
            clientHistory.push({
              role: 'model',
              parts: modelParts,
            });
          }
        }
      }
    }
  }

  return clientHistory;
}

/**
 * Resume session history into a GeminiClient.
 *
 * Strategy:
 *  Filesystem storage: read ConversationRecord from the session file,
 *    convert messages to Content[], and pass ResumedSessionData so
 *    ChatRecordingService continues writing to the same file.
 *
 * This function does not return a value. It will either resume the chat or do nothing.
 */
export async function resumeSessionHistory(
  geminiClient: GeminiClient,
  taskId: string,
): Promise<void> {
  const chatRecordingService = geminiClient.getChatRecordingService();
  if (!chatRecordingService) {
    return;
  }

  const newFilePath = chatRecordingService.getConversationFilePath();
  if (!newFilePath) {
    return;
  }
  const chatsDir = path.dirname(newFilePath);

  const shortId = taskId.slice(0, 8);
  if (shortId.length !== 8) {
    logger.warn('[sessionUtils] Invalid taskId for session lookup: ' + taskId);
    return;
  }

  let files: string[];
  try {
    files = await fs.readdir(chatsDir);
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') {
      return;
    }
    logger.error(
      '[sessionUtils] Failed to read chats directory ' + chatsDir,
      e,
    );
    return;
  }

  const matchingFiles = files.filter(
    (f) =>
      f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('-' + shortId + '.json'),
  );

  if (matchingFiles.length === 0) {
    return;
  }

  matchingFiles.sort().reverse();
  const latestFilename = matchingFiles[0];
  const filePath = path.resolve(chatsDir, latestFilename);

  if (!filePath.startsWith(path.resolve(chatsDir))) {
    logger.error('[sessionUtils] Path traversal attempt detected: ' + filePath);
    return;
  }

  let conversation: ConversationRecord;
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsedConversation: unknown = JSON.parse(fileContent);
    if (!isConversationRecord(parsedConversation)) {
      logger.error(
        '[sessionUtils] Invalid session file structure: ' + filePath,
      );
      return;
    }
    conversation = parsedConversation;
  } catch (e) {
    logger.error(
      '[sessionUtils] Failed to read or parse session file ' + filePath,
      e,
    );
    return;
  }

  if (!conversation?.messages || conversation.messages.length === 0) {
    return;
  }

  const clientHistory = convertMessagesToClientHistory(conversation.messages);
  if (clientHistory.length === 0) {
    return;
  }

  const resumedData: ResumedSessionData = { conversation, filePath };

  logger.info(
    '[sessionUtils] Task ' +
      taskId +
      ': Resuming from filesystem with ' +
      clientHistory.length +
      ' history entries.',
  );
  await geminiClient.resumeChat(clientHistory, resumedData);
}
