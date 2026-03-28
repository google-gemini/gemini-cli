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
import { LlmRole } from '../telemetry/types.js';

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

Provide your response in JSON format with two fields:
1. "summary": The 80-character sentence (e.g., "Add dark mode to the app")
2. "alias": A 2-3 word URL-friendly slug in lowercase (e.g., "add-dark-mode")

Response JSON:`;

/**
 * Options for generating a session summary.
 */
export interface GenerateSummaryOptions {
  messages: MessageRecord[];
  maxMessages?: number;
  timeout?: number;
}

/**
 * The result of generating a session summary and alias.
 */
export interface SummaryResult {
  summary: string;
  alias: string;
}

/**
 * Service for generating AI summaries of chat sessions.
 * Uses Gemini Flash Lite to create concise, user-intent-focused summaries.
 */
export class SessionSummaryService {
  constructor(private readonly baseLlmClient: BaseLlmClient) {}

  /**
   * Generate a summary and alias of a chat session focusing on user intent.
   * Returns null if generation fails for any reason.
   */
  async generateSummary(
    options: GenerateSummaryOptions,
  ): Promise<SummaryResult | null> {
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
          role: LlmRole.UTILITY_SUMMARIZER,
        });

        const rawResponse = getResponseText(response);

        if (!rawResponse || rawResponse.trim().length === 0) {
          debugLogger.debug('[SessionSummary] Empty response returned');
          return null;
        }

        // Clean and parse JSON
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]) as unknown;
            if (
              typeof result === 'object' &&
              result !== null &&
              'summary' in result &&
              typeof result.summary === 'string' &&
              'alias' in result &&
              typeof result.alias === 'string'
            ) {
              // Basic cleanup of summary
              let cleanedSummary = result.summary
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              cleanedSummary = cleanedSummary.replace(/^["']|["']$/g, '');

              // Basic cleanup of alias (ensure slug format)
              const cleanedAlias = result.alias
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

              debugLogger.debug(
                `[SessionSummary] Generated summary: "${cleanedSummary}", alias: "${cleanedAlias}"`,
              );
              return {
                summary: cleanedSummary,
                alias: cleanedAlias,
              };
            }
          } catch (e) {
            debugLogger.debug(
              `[SessionSummary] JSON parsing failed, falling back to raw text: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        // Fallback: If no JSON or parsing fails, use the first line as summary
        let rawSummary = rawResponse.split('\n')[0].trim();
        rawSummary = rawSummary.replace(/^["']|["']$/g, '');

        if (rawSummary.length > 0) {
          const generatedAlias = rawSummary
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .split('-')
            .slice(0, 3)
            .join('-');

          debugLogger.debug(
            `[SessionSummary] Fallback summary: "${rawSummary}", alias: "${generatedAlias}"`,
          );
          return {
            summary: rawSummary,
            alias: generatedAlias,
          };
        }

        return null;
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
