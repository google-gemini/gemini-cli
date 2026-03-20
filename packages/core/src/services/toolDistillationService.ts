/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LlmRole,
  ToolOutputTruncatedEvent,
  logToolOutputTruncated,
  debugLogger,
  type Config,
} from '../index.js';
import type { PartListUnion } from '@google/genai';
import { type GeminiClient } from '../core/client.js';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../config/models.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from '../utils/fileUtils.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
} from '../tools/tool-names.js';

export interface DistilledToolOutput {
  truncatedContent: PartListUnion;
  outputFile?: string;
}

export class ToolOutputDistillationService {
  constructor(
    private readonly config: Config,
    private readonly geminiClient: GeminiClient,
    private readonly promptId: string,
  ) {}

  /**
   * Distills a tool's output if it exceeds configured length thresholds, preserving
   * the agent's context window. This includes saving the raw output to disk, replacing
   * the output with a truncated placeholder, and optionally summarizing the output
   * via a secondary LLM call if the output is massively oversized.
   */
  async distill(
    toolName: string,
    callId: string,
    content: PartListUnion,
  ): Promise<DistilledToolOutput> {
    // Explicitly bypass escape hatches that natively handle large outputs
    if (this.isExemptFromDistillation(toolName)) {
      return { truncatedContent: content };
    }

    const threshold = this.config.getTruncateToolOutputThreshold();
    if (threshold <= 0) {
      return { truncatedContent: content };
    }

    const originalContentLength = this.calculateContentLength(content);

    if (originalContentLength > threshold) {
      return this.performDistillation(
        toolName,
        callId,
        content,
        originalContentLength,
        threshold,
      );
    }

    return { truncatedContent: content };
  }

  private isExemptFromDistillation(toolName: string): boolean {
    return (
      toolName === READ_FILE_TOOL_NAME || toolName === READ_MANY_FILES_TOOL_NAME
    );
  }

  private calculateContentLength(content: PartListUnion): number {
    if (typeof content === 'string') {
      return content.length;
    }

    if (Array.isArray(content)) {
      return content.reduce((acc, part) => {
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return acc + part.text.length;
        }
        return acc;
      }, 0);
    }

    return 0;
  }

  private stringifyContent(content: PartListUnion): string {
    return typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2);
  }

  private async performDistillation(
    toolName: string,
    callId: string,
    content: PartListUnion,
    originalContentLength: number,
    threshold: number,
  ): Promise<DistilledToolOutput> {
    const stringifiedContent = this.stringifyContent(content);

    // Save the raw, untruncated string to disk for human review
    const { outputFile: savedPath } = await saveTruncatedToolOutput(
      stringifiedContent,
      toolName,
      callId,
      this.config.storage.getProjectTempDir(),
      this.promptId,
    );

    let truncatedText = formatTruncatedToolOutput(
      stringifiedContent,
      savedPath,
      threshold,
    );

    // If the output is massively oversized, attempt to generate a structural map
    const summarizationThreshold = threshold * 1.5;
    if (originalContentLength > summarizationThreshold) {
      const summaryText = await this.generateStructuralMap(
        toolName,
        stringifiedContent,
        Math.floor(summarizationThreshold),
      );

      if (summaryText) {
        truncatedText += `\n\n--- Structural Map of Truncated Content ---\n${summaryText}`;
      }
    }

    logToolOutputTruncated(
      this.config,
      new ToolOutputTruncatedEvent(this.promptId, {
        toolName,
        originalContentLength,
        truncatedContentLength: truncatedText.length,
        threshold,
      }),
    );

    return {
      truncatedContent:
        typeof content === 'string' ? truncatedText : [{ text: truncatedText }],
      outputFile: savedPath,
    };
  }

  /**
   * Calls a fast, internal model (Flash-Lite) to provide a high-level summary
   * of the truncated content's structure.
   */
  private async generateStructuralMap(
    toolName: string,
    stringifiedContent: string,
    maxPreviewLen: number,
  ): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const promptText = `The following output from the tool '${toolName}' is extremely large and has been truncated. Please provide a very brief, high-level structural map of its contents (e.g., key sections, JSON schema outline, or line number ranges for major components). Keep the summary under 10 lines. Do not attempt to summarize the specific data values, just the structure so another agent knows what is inside.

Output to summarize:
${stringifiedContent.slice(0, maxPreviewLen)}...`;

      const summaryResponse = await this.geminiClient.generateContent(
        {
          model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
          overrideScope: 'internal-summarizer',
        },
        [{ parts: [{ text: promptText }] }],
        controller.signal,
        LlmRole.MAIN,
      );

      clearTimeout(timeoutId);

      return summaryResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
      // Fail gracefully, summarization is a progressive enhancement
      debugLogger.debug(
        'Failed to generate structural map for truncated output:',
        e,
      );
      return undefined;
    }
  }
}
