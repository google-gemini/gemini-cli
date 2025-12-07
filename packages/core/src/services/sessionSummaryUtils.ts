/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { SessionSummaryService } from './sessionSummaryService.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Generates and saves a summary for the current session.
 * This is called during session cleanup and is non-blocking - errors are logged but don't prevent exit.
 */
export async function generateAndSaveSummary(config: Config): Promise<void> {
  try {
    // Get the chat recording service from config
    const chatRecordingService = config
      .getGeminiClient()
      ?.getChatRecordingService();
    if (!chatRecordingService) {
      debugLogger.debug('[SessionSummary] No chat recording service available');
      return;
    }

    // Get the current conversation
    const conversation = chatRecordingService.getConversation();
    if (!conversation) {
      debugLogger.debug('[SessionSummary] No conversation to summarize');
      return;
    }

    // Skip if summary already exists (e.g., resumed session)
    if (conversation.summary) {
      debugLogger.debug('[SessionSummary] Summary already exists, skipping');
      return;
    }

    // Skip if no messages
    if (conversation.messages.length === 0) {
      debugLogger.debug('[SessionSummary] No messages to summarize');
      return;
    }

    // Create summary service
    const contentGenerator = config.getContentGenerator();
    const baseLlmClient = new BaseLlmClient(contentGenerator, config);
    const summaryService = new SessionSummaryService(baseLlmClient);

    // Generate summary
    const summary = await summaryService.generateSummary({
      messages: conversation.messages,
    });

    // Save summary if generated successfully
    if (summary) {
      chatRecordingService.saveSummary(summary);
      debugLogger.debug(`[SessionSummary] Saved summary: "${summary}"`);
    } else {
      debugLogger.warn('[SessionSummary] Failed to generate summary');
    }
  } catch (error) {
    // Log but don't throw - we want graceful degradation
    debugLogger.warn(
      `[SessionSummary] Error in generateAndSaveSummary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
