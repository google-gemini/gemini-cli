/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageRecord } from './chatRecordingService.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Content } from '@google/genai';
import { getResponseText } from '../utils/partUtils.js';

const DEFAULT_MAX_MESSAGES = 20;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_MESSAGE_LENGTH = 500;

const SUMMARY_PROMPT = `Summarize the user's primary intent or goal in this conversation in ONE sentence (max 80 characters).
Focus on what the user was trying to accomplish.

Examples:
- "Add dark mode to the app"
- "Fix authentication bug in login flow"
- "Understand how the API routing works"
- "Refactor database connection logic"
- "Debug memory leak in production"

Conversation:
{conversation}

Summary (max 80 chars):`;

/**
 * Options for generating a session summary.
 */
export interface GenerateSummaryOptions {
  messages: MessageRecord[];
  maxMessages?: number;
  timeout?: number;
}

/**
 * Service for generating AI summaries of chat sessions.
 * Uses Gemini Flash Lite to create concise, user-intent-focused summaries.
 */
export class SessionSummaryService {
  constructor(private readonly baseLlmClient: BaseLlmClient) {}

  /**
   * Generate a 1-line summary of a chat session focusing on user intent.
   * Returns null if generation fails for any reason.
   */
  async generateSummary(
    options: GenerateSummaryOptions,
  ): Promise<string | null> {
    const {
      messages,
      maxMessages = DEFAULT_MAX_MESSAGES,
      timeout = DEFAULT_TIMEOUT_MS,
    } = options;

    try {
      // Filter to user/gemini messages only (exclude system messages)
      const filteredMessages = messages.filter((msg) => {
        // Skip system messages (info, error, warning)
        if (msg.type !== 'user' && msg.type !== 'gemini') {
          return false;
        }
        const content = partListUnionToString(msg.content);
        return content.trim().length > 0;
      });

      // Apply sliding window selection: first N + last N messages
      let relevantMessages: MessageRecord[];
      if (filteredMessages.length <= maxMessages) {
        // If fewer messages than max, include all
        relevantMessages = filteredMessages;
      } else {
        // Sliding window: take the first and last messages.
        const firstWindowSize = Math.ceil(maxMessages / 2);
        const lastWindowSize = Math.floor(maxMessages / 2);
        const firstMessages = filteredMessages.slice(0, firstWindowSize);
        const lastMessages = filteredMessages.slice(-lastWindowSize);
        relevantMessages = firstMessages.concat(lastMessages);
      }

      if (relevantMessages.length === 0) {
        debugLogger.debug('[SessionSummary] No messages to summarize');
        return null;
      }

      // Format conversation for the prompt
      const conversationText = relevantMessages
        .map((msg) => {
          const role = msg.type === 'user' ? 'User' : 'Assistant';
          const content = partListUnionToString(msg.content);
          // Truncate very long messages to avoid token limit
          const truncated =
            content.length > MAX_MESSAGE_LENGTH
              ? content.slice(0, MAX_MESSAGE_LENGTH) + '...'
              : content;
          return `${role}: ${truncated}`;
        })
        .join('\n\n');

      const prompt = SUMMARY_PROMPT.replace('{conversation}', conversationText);

      // Create abort controller with timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);

      try {
        const contents: Content[] = [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ];

        const response = await this.baseLlmClient.generateContent({
          modelConfigKey: { model: 'summarizer-default' },
          contents,
          abortSignal: abortController.signal,
          promptId: 'session-summary-generation',
        });

        const summary = getResponseText(response);

        if (!summary || summary.trim().length === 0) {
          debugLogger.debug('[SessionSummary] Empty summary returned');
          return null;
        }

        // Clean the summary
        let cleanedSummary = summary
          .replace(/\n+/g, ' ') // Collapse newlines to spaces
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim(); // Trim after all processing

        // Remove quotes if the model added them
        cleanedSummary = cleanedSummary.replace(/^["']|["']$/g, '');

        debugLogger.debug(`[SessionSummary] Generated: "${cleanedSummary}"`);
        return cleanedSummary;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Log the error but don't throw - we want graceful degradation
      if (error instanceof Error && error.name === 'AbortError') {
        debugLogger.debug('[SessionSummary] Timeout generating summary');
      } else {
        debugLogger.debug(
          `[SessionSummary] Error generating summary: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  }
}
