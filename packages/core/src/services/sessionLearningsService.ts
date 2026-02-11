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
import { SessionSummaryService } from './sessionSummaryService.js';
import { sanitizeFilenamePart } from '../utils/fileUtils.js';
import type { Content } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_MESSAGES = 2;
const TIMEOUT_MS = 60000; // Increased timeout for potentially larger context

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

      // Prepare transcript (no max messages, no max length)
      const transcript = conversation.messages
        .map((msg) => {
          const role = msg.type === 'user' ? 'User' : 'Assistant';
          const content = partListUnionToString(msg.content);
          return `[${role}]: ${content}`;
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

        const summaryText = getResponseText(response);
        if (!summaryText) {
          debugLogger.warn(
            '[SessionLearnings] Failed to generate summary (empty response)',
          );
          return;
        }

        // Generate descriptive filename
        const summaryService = new SessionSummaryService(baseLlmClient);
        const sessionTitle = await summaryService.generateSummary({
          messages: conversation.messages,
        });

        const dateStr = new Date().toISOString().split('T')[0];
        const sanitizedTitle = sessionTitle
          ? sanitizeFilenamePart(sessionTitle.trim().replace(/\s+/g, '-'))
          : 'untitled';

        const fileName = `learnings-${sanitizedTitle}-${dateStr}.md`;

        // Determine output directory
        const configOutputPath = this.config.getSessionLearningsOutputPath();
        let outputDir = this.config.getWorkingDir();

        if (configOutputPath) {
          if (path.isAbsolute(configOutputPath)) {
            outputDir = configOutputPath;
          } else {
            outputDir = path.join(
              this.config.getWorkingDir(),
              configOutputPath,
            );
          }
        }

        // Ensure directory exists
        await fs.mkdir(outputDir, { recursive: true });

        const filePath = path.join(outputDir, fileName);
        await fs.writeFile(filePath, summaryText, 'utf-8');
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
