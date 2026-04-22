/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { SessionSummaryService } from './sessionSummaryService.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
  type MessageRecord,
} from './chatRecordingService.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;

interface LoadedSession {
  summary?: string;
  lastUpdated?: string;
  messages: ConversationRecord['messages'];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: unknown } {
  return isObjectRecord(obj) && prop in obj;
}

function isStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is { [key in T]: string } {
  return hasProperty(obj, prop) && typeof obj[prop] === 'string';
}

function getStringProperty<T extends string>(
  obj: unknown,
  prop: T,
): string | undefined {
  return isStringProperty(obj, prop) ? obj[prop] : undefined;
}

function isMessageRecord(value: unknown): value is MessageRecord {
  return isStringProperty(value, 'id');
}

function isMessageRecordArray(
  value: unknown,
): value is ConversationRecord['messages'] {
  return Array.isArray(value) && value.every(isMessageRecord);
}

function isSupportedSessionFile(fileName: string): boolean {
  return (
    fileName.startsWith(SESSION_FILE_PREFIX) &&
    (fileName.endsWith('.json') || fileName.endsWith('.jsonl'))
  );
}

function getLoadedSessionTimestamp(session: LoadedSession): number {
  if (!session.lastUpdated) {
    return 0;
  }
  const parsed = Date.parse(session.lastUpdated);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseJsonSession(content: string): LoadedSession | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isObjectRecord(parsed) || !isMessageRecordArray(parsed['messages'])) {
      return null;
    }

    return {
      summary: getStringProperty(parsed, 'summary'),
      lastUpdated: getStringProperty(parsed, 'lastUpdated'),
      messages: parsed['messages'],
    };
  } catch {
    return null;
  }
}

function parseJsonlSession(content: string): LoadedSession | null {
  const messages: ConversationRecord['messages'] = [];
  const messageIndex = new Map<string, number>();
  let summary: string | undefined;
  let lastUpdated: string | undefined;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      return null;
    }

    if (!isObjectRecord(parsed)) {
      continue;
    }

    if (isStringProperty(parsed, '$rewindTo')) {
      const rewindTo = parsed['$rewindTo'];
      const rewindIndex = messageIndex.get(rewindTo);
      if (rewindIndex === undefined) {
        messages.length = 0;
        messageIndex.clear();
        continue;
      }

      messages.splice(rewindIndex);
      for (const [messageId, index] of [...messageIndex.entries()]) {
        if (index >= rewindIndex) {
          messageIndex.delete(messageId);
        }
      }
      continue;
    }

    if (isMessageRecord(parsed)) {
      const messageId = parsed['id'];
      const message = parsed;
      const existingIndex = messageIndex.get(messageId);
      if (existingIndex === undefined) {
        messageIndex.set(messageId, messages.length);
        messages.push(message);
      } else {
        messages[existingIndex] = message;
      }
      continue;
    }

    if ('$set' in parsed && isObjectRecord(parsed['$set'])) {
      const updates = parsed['$set'];
      summary = getStringProperty(updates, 'summary') ?? summary;
      lastUpdated = getStringProperty(updates, 'lastUpdated') ?? lastUpdated;
      continue;
    }

    if (isMessageRecordArray(parsed['messages'])) {
      return {
        summary: getStringProperty(parsed, 'summary') ?? summary,
        lastUpdated: getStringProperty(parsed, 'lastUpdated') ?? lastUpdated,
        messages: parsed['messages'],
      };
    }

    summary = getStringProperty(parsed, 'summary') ?? summary;
    lastUpdated = getStringProperty(parsed, 'lastUpdated') ?? lastUpdated;
  }

  return {
    summary,
    lastUpdated,
    messages,
  };
}

async function loadSessionForSummary(
  sessionPath: string,
): Promise<LoadedSession | null> {
  const content = await fs.readFile(sessionPath, 'utf-8');
  return sessionPath.endsWith('.jsonl')
    ? parseJsonlSession(content)
    : parseJsonSession(content);
}

/**
 * Generates and saves a summary for a session file.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  const conversation = await loadSessionForSummary(sessionPath);
  if (!conversation) {
    debugLogger.debug(`[SessionSummary] Could not read session ${sessionPath}`);
    return;
  }

  // Skip if summary already exists
  if (conversation.summary) {
    debugLogger.debug(
      `[SessionSummary] Summary already exists for ${sessionPath}, skipping`,
    );
    return;
  }

  // Skip if no messages
  if (conversation.messages.length === 0) {
    debugLogger.debug(
      `[SessionSummary] No messages to summarize in ${sessionPath}`,
    );
    return;
  }

  // Create summary service
  const contentGenerator = config.getContentGenerator();
  if (!contentGenerator) {
    debugLogger.debug(
      '[SessionSummary] Content generator not available, skipping summary generation',
    );
    return;
  }
  const baseLlmClient = new BaseLlmClient(contentGenerator, config);
  const summaryService = new SessionSummaryService(baseLlmClient);

  // Generate summary
  const summary = await summaryService.generateSummary({
    messages: conversation.messages,
  });

  if (!summary) {
    debugLogger.warn(
      `[SessionSummary] Failed to generate summary for ${sessionPath}`,
    );
    return;
  }

  // Re-read the file before writing to handle race conditions
  const freshConversation = await loadSessionForSummary(sessionPath);
  if (!freshConversation) {
    debugLogger.debug(`[SessionSummary] Could not re-read ${sessionPath}`);
    return;
  }

  // Check if summary was added by another process
  if (freshConversation.summary) {
    debugLogger.debug(
      `[SessionSummary] Summary was added by another process for ${sessionPath}`,
    );
    return;
  }

  const lastUpdated = new Date().toISOString();
  if (sessionPath.endsWith('.jsonl')) {
    await fs.appendFile(
      sessionPath,
      `${JSON.stringify({ $set: { summary, lastUpdated } })}\n`,
    );
  } else {
    await fs.writeFile(
      sessionPath,
      JSON.stringify(
        {
          ...freshConversation,
          summary,
          lastUpdated,
        },
        null,
        2,
      ),
    );
  }
  debugLogger.debug(
    `[SessionSummary] Saved summary for ${sessionPath}: "${summary}"`,
  );
}

/**
 * Finds the most recently created session that needs a summary.
 * Returns the path if it needs a summary, null otherwise.
 */
export async function getPreviousSession(
  config: Config,
): Promise<string | null> {
  try {
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

    // Check if chats directory exists
    try {
      await fs.access(chatsDir);
    } catch {
      debugLogger.debug('[SessionSummary] No chats directory found');
      return null;
    }

    // List session files
    const allFiles = await fs.readdir(chatsDir);
    const sessionFiles = allFiles.filter(isSupportedSessionFile);

    if (sessionFiles.length === 0) {
      debugLogger.debug('[SessionSummary] No session files found');
      return null;
    }

    const sessions: Array<{ filePath: string; conversation: LoadedSession }> =
      [];
    for (const sessionFile of sessionFiles) {
      const filePath = path.join(chatsDir, sessionFile);
      try {
        const conversation = await loadSessionForSummary(filePath);
        if (conversation) {
          sessions.push({ filePath, conversation });
        }
      } catch {
        // Ignore unreadable session files
      }
    }

    if (sessions.length === 0) {
      debugLogger.debug('[SessionSummary] Could not read most recent session');
      return null;
    }

    sessions.sort((a, b) => {
      const timestampDelta =
        getLoadedSessionTimestamp(b.conversation) -
        getLoadedSessionTimestamp(a.conversation);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }
      return path.basename(b.filePath).localeCompare(path.basename(a.filePath));
    });

    const { filePath, conversation } = sessions[0];
    if (conversation.summary) {
      debugLogger.debug(
        '[SessionSummary] Most recent session already has summary',
      );
      return null;
    }

    // Only generate summaries for sessions with more than 1 user message
    const userMessageCount = conversation.messages.filter(
      (message) => message.type === 'user',
    ).length;
    if (userMessageCount <= MIN_MESSAGES_FOR_SUMMARY) {
      debugLogger.debug(
        `[SessionSummary] Most recent session has ${userMessageCount} user message(s), skipping (need more than ${MIN_MESSAGES_FOR_SUMMARY})`,
      );
      return null;
    }

    return filePath;
  } catch (error) {
    debugLogger.debug(
      `[SessionSummary] Error finding previous session: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Generates summary for the previous session if it lacks one.
 * This is designed to be called fire-and-forget on startup.
 */
export async function generateSummary(config: Config): Promise<void> {
  try {
    const sessionPath = await getPreviousSession(config);
    if (sessionPath) {
      await generateAndSaveSummary(config, sessionPath);
    }
  } catch (error) {
    // Log but don't throw - we want graceful degradation
    debugLogger.warn(
      `[SessionSummary] Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
