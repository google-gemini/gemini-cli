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
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES_FOR_SUMMARY = 1;

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const freshConversation: ConversationRecord = JSON.parse(freshContent);

  // Check if summary was added by another process
  if (freshConversation.summary) {
    debugLogger.debug(
      `[SessionSummary] Summary was added by another process for ${sessionPath}`,
    );
    return;
  }

  // Add summary and write back
  freshConversation.summary = summary;
  freshConversation.lastUpdated = new Date().toISOString();
  await fs.writeFile(sessionPath, JSON.stringify(freshConversation, null, 2));

  // Determine prompt from conversation
  const lastUserMessage = freshConversation.messages
    .filter((m) => m.type === 'user')
    .pop();
  let prompt = 'Unknown Prompt';
  if (lastUserMessage?.content) {
    if (typeof lastUserMessage.content === 'string') {
      prompt = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      prompt = lastUserMessage.content
        .map((p) => {
          if (typeof p === 'object' && p !== null && 'text' in p) {
            return String(p.text || '');
          }
          return '';
        })
        .join('');
    }
  }

  const durationMs =
    new Date(freshConversation.lastUpdated).getTime() -
    new Date(freshConversation.startTime).getTime();

  // 1. Persist turn to JSONL logger
  config.getSessionLogger().log(
    freshConversation.sessionId,
    prompt,
    summary,
    freshConversation.directories || [], // Using directories as proxy for now
    durationMs > 0 ? durationMs : 0,
  );

  // 2. Spawn Consolidation Worker (Phase 1)
  try {
    // Use import.meta.url for ESM compatibility
    const { fileURLToPath } = await import('node:url');
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const workerScript = path.join(currentDir, 'memoryConsolidationWorker.js');
    const { Worker } = await import('node:worker_threads');

    // We only spawn if we have an API key right now
    const apiKey = config.getContentGeneratorConfig()?.apiKey;
    if (apiKey) {
      const worker = new Worker(workerScript, {
        workerData: {
          projectRoot: config.getProjectRoot(),
          logDir: config.storage.getSessionLogDir(),
          geminiMdPath: path.join(config.getProjectRoot(), 'GEMINI.md'),
          apiKey,
          model: 'gemini-2.5-flash',
          lookbackDays: 7,
        },
      });

      // Handle worker errors to prevent unhandled rejections
      worker.on('error', (error: Error) => {
        debugLogger.warn(
          `[SessionSummary] Memory consolidation worker error:`,
          error.message,
        );
      });

      worker.on('message', (message: unknown) => {
        debugLogger.debug(
          `[SessionSummary] Memory consolidation worker result:`,
          message,
        );
      });

      debugLogger.debug(
        `[SessionSummary] Spawned background memory consolidation worker`,
      );
    } else {
      debugLogger.debug(
        `[SessionSummary] Skipping memory consolidation worker (no raw API key)`,
      );
    }
  } catch (err) {
    debugLogger.warn(
      `[SessionSummary] Failed to spawn memory consolidation worker`,
      err,
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

    // Check the most recently created session
    const mostRecentFile = sessionFiles[0];
    const filePath = path.join(chatsDir, mostRecentFile);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const conversation: ConversationRecord = JSON.parse(content);

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
