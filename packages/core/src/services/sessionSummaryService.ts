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

const EXTRACTION_MAX_MESSAGES = 50;
const EXTRACTION_TIMEOUT_MS = 30000;
const EXTRACTION_MAX_MESSAGE_LENGTH = 2000;

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

const MEMORY_EXTRACTION_PROMPT = `You are reading a past conversation between a user and an AI assistant. Your job is to extract notes that would help in future similar conversations.

IMPORTANT: The heading must describe the user's actual goal in the conversation, NOT the task of extracting notes. For example: "Debug auth token refresh bug" or "Add pagination to the API".

Return a markdown document with this exact structure:

# <1-line description of what the user was working on, max 80 chars>

outcome: <success|partial|fail|uncertain>
keywords: <comma-separated searchable terms: tool names, error strings, file paths, concepts>

## What was done
<Concise description of what happened in the session. Focus on actions taken and results achieved. Skip trivial steps.>

## How the user works
<Bullet list of user preferences, working style, and corrections revealed during this session. Use evidence from user messages — what they asked for, corrected, or interrupted to enforce. Omit this section if no meaningful signals.>

## What we learned
<Bullet list of validated facts, useful procedures, commands, file paths, and reusable knowledge discovered. Stick to facts confirmed by tool output or user validation, not assistant speculation.>

## What went wrong
<Bullet list of failures, dead ends, and what worked instead. Include symptom, cause, and fix when known. Omit this section if nothing went wrong.>

Rules:
- Be evidence-based. Do not invent facts or claim verification that did not happen.
- Redact secrets: never store tokens, keys, or passwords. Replace with [REDACTED].
- Prefer the user's own wording when capturing preferences.
- Keep it concise but useful. A future agent should be able to understand what happened without re-reading the full conversation.
- If the conversation has no meaningful reusable signal (trivial questions, one-off tasks), return only the heading line and metadata with empty sections.
- Omit sections that have no content rather than writing placeholder text.

Conversation:
{conversation}

Memory notes (markdown):`;

/**
 * Result of memory extraction containing both a summary and full notes.
 */
export interface MemoryExtractionResult {
  /** 1-line summary parsed from the markdown heading */
  summary: string;
  /** Full markdown memory notes */
  memoryScratchpad: string;
}

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
      const conversationText = this.formatConversation(
        messages,
        maxMessages,
        MAX_MESSAGE_LENGTH,
      );

      if (!conversationText) {
        debugLogger.debug('[SessionSummary] No messages to summarize');
        return null;
      }

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

  /**
   * Extract structured memory notes from a chat session.
   * Returns both a 1-line summary (parsed from the heading) and the full
   * markdown scratchpad, or null if extraction fails.
   */
  async generateMemoryExtraction(
    options: GenerateSummaryOptions,
  ): Promise<MemoryExtractionResult | null> {
    const {
      messages,
      maxMessages = EXTRACTION_MAX_MESSAGES,
      timeout = EXTRACTION_TIMEOUT_MS,
    } = options;

    try {
      const conversationText = this.formatConversation(
        messages,
        maxMessages,
        EXTRACTION_MAX_MESSAGE_LENGTH,
      );

      if (!conversationText) {
        debugLogger.debug('[SessionSummary] No messages for memory extraction');
        return null;
      }

      const prompt = MEMORY_EXTRACTION_PROMPT.replace(
        '{conversation}',
        conversationText,
      );

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
          promptId: 'session-memory-extraction',
          role: LlmRole.UTILITY_SUMMARIZER,
        });

        const rawText = getResponseText(response);

        if (!rawText || rawText.trim().length === 0) {
          debugLogger.debug(
            '[SessionSummary] Empty memory extraction returned',
          );
          return null;
        }

        const memoryScratchpad = rawText.trim();

        // Parse the summary from the first markdown heading
        const headingMatch = memoryScratchpad.match(/^#\s+(.+)$/m);
        let summary = headingMatch
          ? headingMatch[1].trim()
          : memoryScratchpad.split('\n')[0].trim();

        // Clean the summary: remove quotes, normalize whitespace
        summary = summary.replace(/^["']|["']$/g, '').trim();

        debugLogger.debug(
          `[SessionSummary] Memory extraction generated, summary: "${summary}"`,
        );
        return { summary, memoryScratchpad };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debugLogger.debug('[SessionSummary] Timeout during memory extraction');
      } else {
        debugLogger.debug(
          `[SessionSummary] Error during memory extraction: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }
  }

  /**
   * Filter, window, and format messages into conversation text.
   * Returns null if no relevant messages remain after filtering.
   */
  private formatConversation(
    messages: MessageRecord[],
    maxMessages: number,
    maxMessageLength: number,
  ): string | null {
    const filteredMessages = messages.filter((msg) => {
      if (msg.type !== 'user' && msg.type !== 'gemini') {
        return false;
      }
      const content = partListUnionToString(msg.content);
      return content.trim().length > 0;
    });

    let relevantMessages: MessageRecord[];
    if (filteredMessages.length <= maxMessages) {
      relevantMessages = filteredMessages;
    } else {
      const firstWindowSize = Math.ceil(maxMessages / 2);
      const lastWindowSize = Math.floor(maxMessages / 2);
      const firstMessages = filteredMessages.slice(0, firstWindowSize);
      const lastMessages = filteredMessages.slice(-lastWindowSize);
      relevantMessages = firstMessages.concat(lastMessages);
    }

    if (relevantMessages.length === 0) {
      return null;
    }

    return relevantMessages
      .map((msg) => {
        const role = msg.type === 'user' ? 'User' : 'Assistant';
        const content = partListUnionToString(msg.content);
        const characters = Array.from(content);
        const truncated =
          characters.length > maxMessageLength
            ? characters.slice(0, maxMessageLength).join('') + '...'
            : content;
        return `${role}: ${truncated}`;
      })
      .join('\n\n');
  }
}
