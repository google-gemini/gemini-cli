/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { SessionSummaryService } from './sessionSummaryService.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';
import { uiTelemetryService } from '../telemetry/uiTelemetry.js';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
} from './chatRecordingService.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;

/**
 * Gets all existing aliases in the project.
 */
async function getAllExistingAliases(
  chatsDir: string,
): Promise<Map<string, string>> {
  const aliases = new Map<string, string>(); // alias -> sessionId
  try {
    const allFiles = await fs.readdir(chatsDir);
    const sessionFiles = allFiles.filter(
      (f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'),
    );

    for (const file of sessionFiles) {
      const filePath = path.join(chatsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const conversation: ConversationRecord = JSON.parse(content);
        if (conversation.alias) {
          aliases.set(conversation.alias, conversation.sessionId);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore errors
  }
  return aliases;
}

/**
 * Generates and saves a summary for a session file.
 */
async function generateAndSaveSummary(
  config: Config,
  sessionPath: string,
): Promise<void> {
  // Read session file
  const content = await fs.readFile(sessionPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const conversation: ConversationRecord = JSON.parse(content);

  // Skip if both summary and alias already exist
  if (conversation.summary && conversation.alias) {
    debugLogger.debug(
      `[SessionSummary] Summary and alias already exist for ${sessionPath}, skipping`,
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

  // Generate summary and alias
  const result = await summaryService.generateSummary({
    messages: conversation.messages,
  });

  if (!result) {
    debugLogger.warn(
      `[SessionSummary] Failed to generate summary/alias for ${sessionPath}`,
    );
    return;
  }

  let { summary, alias } = result;

  // Ensure alias uniqueness
  const chatsDir = path.dirname(sessionPath);
  const existingAliases = await getAllExistingAliases(chatsDir);
  const originalAlias = alias;
  let suffix = 1;

  while (
    existingAliases.has(alias) &&
    existingAliases.get(alias) !== conversation.sessionId
  ) {
    suffix++;
    alias = `${originalAlias}-${suffix}`;
  }

  // Re-read the file before writing to handle race conditions
  const freshContent = await fs.readFile(sessionPath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const freshConversation: ConversationRecord = JSON.parse(freshContent);

  // Skip if both summary and alias already exist AND it's not the current session.
  // We allow overwriting during the current session to refine the name as conversation deepens.
  if (
    freshConversation.summary &&
    freshConversation.alias &&
    freshConversation.sessionId !== config.getSessionId()
  ) {
    debugLogger.debug(
      `[SessionSummary] Summary and alias already exist for ${sessionPath}, skipping`,
    );
    return;
  }

  // Update live telemetry and use ChatRecordingService if this is the current active session
  if (freshConversation.sessionId === config.getSessionId()) {
    const chatRecordingService = config
      .getGeminiClient()
      ?.getChatRecordingService();

    if (chatRecordingService) {
      chatRecordingService.setSummaryAndAlias(summary, alias);
    } else {
      freshConversation.summary = summary;
      freshConversation.alias = alias;
      freshConversation.lastUpdated = new Date().toISOString();
      await fs.writeFile(
        sessionPath,
        JSON.stringify(freshConversation, null, 2),
      );
    }
    uiTelemetryService.setAlias(alias);
  } else {
    // Add summary and alias, then write back
    freshConversation.summary = summary;
    freshConversation.alias = alias;
    freshConversation.lastUpdated = new Date().toISOString();
    await fs.writeFile(sessionPath, JSON.stringify(freshConversation, null, 2));
  }

  debugLogger.debug(
    `[SessionSummary] Saved summary for ${sessionPath}: "${summary}", alias: "${alias}"`,
  );
}

/**
 * Finds all sessions that need a summary or alias.
 * Returns an array of paths, newest first.
 */
export async function getSessionsNeedingSummary(
  config: Config,
): Promise<string[]> {
  try {
    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');

    // Check if chats directory exists
    try {
      await fs.access(chatsDir);
    } catch {
      debugLogger.debug('[SessionSummary] No chats directory found');
      return [];
    }

    // List session files
    const allFiles = await fs.readdir(chatsDir);
    const sessionFiles = allFiles
      .filter((f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // Newest first

    const paths: string[] = [];

    for (const file of sessionFiles) {
      const filePath = path.join(chatsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const conversation: ConversationRecord = JSON.parse(content);

        // Skip if both summary and alias already exist
        if (conversation.summary && conversation.alias) {
          continue;
        }

        // Only generate summaries for sessions with messages
        const userMessageCount = conversation.messages.filter(
          (m) => m.type === 'user',
        ).length;
        if (userMessageCount < MIN_MESSAGES_FOR_SUMMARY) {
          continue;
        }

        paths.push(filePath);
      } catch {
        continue;
      }
    }

    return paths;
  } catch (error) {
    debugLogger.debug(
      `[SessionSummary] Error finding sessions: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Generates summary for previous sessions if they lack one.
 * If sessionPath is provided, it summarizes that specific session.
 * This is designed to be called fire-and-forget.
 */
export async function generateSummary(
  config: Config,
  sessionPath?: string,
): Promise<void> {
  try {
    if (sessionPath) {
      await generateAndSaveSummary(config, sessionPath);
      return;
    }

    const sessionPaths = await getSessionsNeedingSummary(config);
    // Limit to 5 at a time to avoid hammering the API on startup
    const limit = sessionPaths.slice(0, 5);
    for (const sessionPath of limit) {
      await generateAndSaveSummary(config, sessionPath);
    }
  } catch (error) {
    // Log but don't throw - we want graceful degradation
    debugLogger.warn(
      `[SessionSummary] Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
