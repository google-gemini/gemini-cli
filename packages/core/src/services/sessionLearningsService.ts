/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';
import { partListUnionToString } from '../core/geminiRequest.js';
import { getResponseText } from '../utils/partUtils.js';
import type { Content } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES = 2;
const MAX_MESSAGES_FOR_CONTEXT = 30;
const MAX_MESSAGE_LENGTH = 1000;
const TIMEOUT_MS = 30000;

const LEARNINGS_FILENAME = 'session-learnings.md';

const LEARNINGS_PROMPT = `It's time to pause on this development. Looking back at what you have done so far:
Prepare a summary of the problem you were trying to solve, the analysis synthesized, and information you would need to implement this request if you were to start again
Don't focus on unnecessary details - keep the abstraction at a level that allows a senior engineer for example, to take it from you.
Do focus on gotchas, explored paths that didn't go anywhere with a why, and what you'd do differently.
Also note down other issues you might have found as future project ideas.

Conversation transcript follows:
---
{transcript}
---

Provide your response in Markdown format.`;

/**
 * Service to generate and save session learnings summaries.
 */
export class SessionLearningsService {
  constructor(private readonly config: Config) {}

  /**
   * Generates a summary of the session learnings and saves it to a file.
   */
  async generateAndSaveLearnings(): Promise<void> {
    try {
      // Check if enabled in settings
      if (!this.config.isSessionLearningsEnabled()) {
        return;
      }

      const geminiClient = this.config.getGeminiClient();
      const recordingService = geminiClient.getChatRecordingService();
      const conversation = recordingService.getConversation();

      if (!conversation || conversation.messages.length < MIN_MESSAGES) {
        debugLogger.debug(
          `[SessionLearnings] Skipping summary, not enough messages (${conversation?.messages.length || 0})`,
        );
        return;
      }

      // Prepare transcript
      const relevantMessages = conversation.messages.slice(
        -MAX_MESSAGES_FOR_CONTEXT,
      );
      const transcript = relevantMessages
        .map((msg) => {
          const role = msg.type === 'user' ? 'User' : 'Assistant';
          const content = partListUnionToString(msg.content);
          const truncated =
            content.length > MAX_MESSAGE_LENGTH
              ? content.slice(0, MAX_MESSAGE_LENGTH) + '...'
              : content;
          return `[${role}]: ${truncated}`;
        })
        .join('\n\n');

      const prompt = LEARNINGS_PROMPT.replace('{transcript}', transcript);

      const contentGenerator = this.config.getContentGenerator();
      if (!contentGenerator) {
        debugLogger.debug('[SessionLearnings] Content generator not available');
        return;
      }

      const baseLlmClient = new BaseLlmClient(contentGenerator, this.config);

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT_MS);

      try {
        const contents: Content[] = [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ];

        debugLogger.debug('[SessionLearnings] Generating summary...');
        const response = await baseLlmClient.generateContent({
          modelConfigKey: { model: 'summarizer-default' },
          contents,
          abortSignal: abortController.signal,
          promptId: 'session-learnings-generation',
        });

        const summary = getResponseText(response);
        if (!summary) {
          debugLogger.warn(
            '[SessionLearnings] Failed to generate summary (empty response)',
          );
          return;
        }

        const filePath = path.join(
          this.config.getWorkingDir(),
          LEARNINGS_FILENAME,
        );
        await fs.writeFile(filePath, summary, 'utf-8');
        debugLogger.log(
          `[SessionLearnings] Saved session learnings to ${filePath}`,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      debugLogger.warn(
        `[SessionLearnings] Error generating learnings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
