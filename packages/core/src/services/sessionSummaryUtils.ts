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
  parseJsonl,
  type ConversationRecord,
} from './chatRecordingService.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;

/**
 * Parses a session file content based on its format.
 */
function parseSessionContent(
  content: string,
  sessionPath: string,
): ConversationRecord {
  if (sessionPath.endsWith('.jsonl')) {
    return parseJsonl(content, '', '');
  }
  return JSON.parse(content);
}

/**
 * Generates and saves a summary for a session file.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  const isJsonl = sessionPath.endsWith('.jsonl');

  // Read session file
  const content = await fs.readFile(sessionPath, 'utf-8');
  const conversation = parseSessionContent(content, sessionPath);

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
  const freshContent = await fs.readFile(sessionPath, 'utf-8');
  const freshStat = await fs.stat(sessionPath);
  const freshConversation = parseSessionContent(freshContent, sessionPath);

  // Check if summary was added by another process
  if (freshConversation.summary) {
    debugLogger.debug(
      `[SessionSummary] Summary was added by another process for ${sessionPath}`,
    );
    return;
  }

  if (isJsonl) {
    // For JSONL: append metadata update (append-only approach)
    const metadataUpdate = {
      type: 'session_metadata',
      summary,
      lastUpdated: new Date().toISOString(),
    };
    await fs.appendFile(sessionPath, JSON.stringify(metadataUpdate) + '\n');
  } else {
    const currentStat = await fs.stat(sessionPath);
    if (currentStat.mtimeMs !== freshStat.mtimeMs) {
      debugLogger.debug(
        `[SessionSummary] Session changed during summary generation for ${sessionPath}, skipping`,
      );
      return;
    }
    // For JSON: rewrite the file
    freshConversation.summary = summary;
    freshConversation.lastUpdated = new Date().toISOString();
    const tmpPath = `${sessionPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(freshConversation, null, 2));
    await fs.rename(tmpPath, sessionPath);
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

    // List session files (both .json and .jsonl)
    const allFiles = await fs.readdir(chatsDir);
    const sessionFiles = allFiles.filter(
      (f) =>
        f.startsWith(SESSION_FILE_PREFIX) &&
        (f.endsWith('.json') || f.endsWith('.jsonl')),
    );

    if (sessionFiles.length === 0) {
      debugLogger.debug('[SessionSummary] No session files found');
      return null;
    }

    // Sort by filename descending (most recently created first)
    // Filename format: session-YYYY-MM-DDTHH-MM-XXXXXXXX.json
    sessionFiles.sort((a, b) => b.localeCompare(a));

    // Check the most recently created session
    const mostRecentFile = sessionFiles[0];
    const filePath = path.join(chatsDir, mostRecentFile);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const conversation = parseSessionContent(content, filePath);

      if (conversation.summary) {
        debugLogger.debug(
          '[SessionSummary] Most recent session already has summary',
        );
        return null;
      }

      // Only generate summaries for sessions with more than 1 user message
      const userMessageCount = conversation.messages.filter(
        (m) => m.type === 'user',
      ).length;
      if (userMessageCount <= MIN_MESSAGES_FOR_SUMMARY) {
        debugLogger.debug(
          `[SessionSummary] Most recent session has ${userMessageCount} user message(s), skipping (need more than ${MIN_MESSAGES_FOR_SUMMARY})`,
        );
        return null;
      }

      return filePath;
    } catch {
      debugLogger.debug('[SessionSummary] Could not read most recent session');
      return null;
    }
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
