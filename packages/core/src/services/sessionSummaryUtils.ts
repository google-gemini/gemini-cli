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
} from './chatRecordingService.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';
import {
  MemoryExtractionEvent,
  MemoryExtractionSkippedEvent,
} from '../telemetry/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;

/**
 * Generates and saves a summary and memory scratchpad for a session file.
 * Uses a single LLM call to produce both outputs.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  // Read session file
  const content = await fs.readFile(sessionPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const conversation: ConversationRecord = JSON.parse(content);

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
  const logger = ClearcutLogger.getInstance(config);
  const messageCount = conversation.messages.length;

  // Generate memory extraction (produces both summary and scratchpad)
  const startTime = Date.now();
  const result = await summaryService.generateMemoryExtraction({
    messages: conversation.messages,
  });
  const durationMs = Date.now() - startTime;

  if (!result) {
    // Fall back to simple summary if extraction fails
    const summary = await summaryService.generateSummary({
      messages: conversation.messages,
    });
    if (summary) {
      await saveSummaryOnly(sessionPath, summary);
      logger?.logMemoryExtractionEvent(
        new MemoryExtractionEvent(false, durationMs, messageCount, 0, true),
      );
    } else {
      logger?.logMemoryExtractionEvent(
        new MemoryExtractionEvent(false, durationMs, messageCount, 0, false),
      );
      debugLogger.warn(
        `[SessionSummary] Failed to generate summary for ${sessionPath}`,
      );
    }
    return;
  }

  // Re-read the file before writing to handle race conditions
  const freshContent = await fs.readFile(sessionPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const freshConversation: ConversationRecord = JSON.parse(freshContent);

  // Check if extraction was added by another process
  if (freshConversation.summary) {
    debugLogger.debug(
      `[SessionSummary] Summary was added by another process for ${sessionPath}`,
    );
    return;
  }

  // Add both summary and scratchpad, then write back
  freshConversation.summary = result.summary;
  freshConversation.memoryScratchpad = result.memoryScratchpad;
  freshConversation.lastUpdated = new Date().toISOString();
  await fs.writeFile(sessionPath, JSON.stringify(freshConversation, null, 2));

  logger?.logMemoryExtractionEvent(
    new MemoryExtractionEvent(
      true,
      durationMs,
      messageCount,
      result.memoryScratchpad.length,
      false,
    ),
  );

  debugLogger.debug(
    `[SessionSummary] Saved memory scratchpad for ${sessionPath}: "${result.summary}"`,
  );
}

/**
 * Saves only the summary (fallback when memory extraction fails).
 */
async function saveSummaryOnly(
  sessionPath: string,
  summary: string,
): Promise<void> {
  const freshContent = await fs.readFile(sessionPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const freshConversation: ConversationRecord = JSON.parse(freshContent);

  if (freshConversation.summary || freshConversation.memoryScratchpad) {
    return;
  }

  freshConversation.summary = summary;
  freshConversation.lastUpdated = new Date().toISOString();
  await fs.writeFile(sessionPath, JSON.stringify(freshConversation, null, 2));
  debugLogger.debug(
    `[SessionSummary] Saved summary (fallback) for ${sessionPath}: "${summary}"`,
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
    const sessionFiles = allFiles.filter(
      (f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'),
    );

    if (sessionFiles.length === 0) {
      debugLogger.debug('[SessionSummary] No session files found');
      return null;
    }

    // Sort by filename descending (most recently created first)
    // Filename format: session-YYYY-MM-DDTHH-MM-XXXXXXXX.json
    sessionFiles.sort((a, b) => b.localeCompare(a));

    // Iterate through sessions to find the first eligible one.
    // The most recent file is typically the current active session (few messages),
    // so we skip past ineligible sessions.
    for (const file of sessionFiles.slice(0, 20)) {
      const filePath = path.join(chatsDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const conversation: ConversationRecord = JSON.parse(content);

        // Skip if summary already exists
        if (conversation.summary) {
          continue;
        }

        // Skip sessions with too few user messages
        const userMessageCount = conversation.messages.filter(
          (m) => m.type === 'user',
        ).length;
        if (userMessageCount <= MIN_MESSAGES_FOR_SUMMARY) {
          continue;
        }

        return filePath;
      } catch {
        // Skip unreadable files
        continue;
      }
    }

    debugLogger.debug(
      '[SessionSummary] No eligible session found for memory extraction',
    );
    return null;
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
    } else {
      ClearcutLogger.getInstance(config)?.logMemoryExtractionSkippedEvent(
        new MemoryExtractionSkippedEvent('no_eligible_session'),
      );
    }
  } catch (error) {
    // Log but don't throw - we want graceful degradation
    debugLogger.warn(
      `[SessionSummary] Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
