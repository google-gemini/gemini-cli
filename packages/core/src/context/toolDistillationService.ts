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
import { saveTruncatedToolOutput } from '../utils/fileUtils.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
} from '../tools/tool-names.js';

import {
  truncateProportionally,
  TOOL_TRUNCATION_PREFIX,
  MIN_TARGET_TOKENS,
  estimateCharsFromTokens,
  normalizeFunctionResponse,
} from './truncation.js';

// Skip structural map generation for outputs larger than this threshold (in characters)
// as it consumes excessive tokens and may not be representative of the full content.
const MAX_DISTILLATION_SIZE = 1_000_000;

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

    const maxTokens = this.config.getToolMaxOutputTokens();
    const thresholdChars = maxTokens * 4;
    if (thresholdChars <= 0) {
      return { truncatedContent: content };
    }

    const originalContentLength = this.calculateContentLength(content);

    if (originalContentLength > thresholdChars) {
      return this.performDistillation(
        toolName,
        callId,
        content,
        originalContentLength,
        thresholdChars,
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
        if (typeof part === 'string') return acc + part.length;
        if (part.text) return acc + part.text.length;
        if (part.functionResponse?.response) {
          // Estimate length of the response object
          return acc + JSON.stringify(part.functionResponse.response).length;
        }
        return acc;
      }, 0);
    }

    return 0;
  }

  private stringifyContent(content: PartListUnion): string {
    if (typeof content === 'string') return content;
    // For arrays or other objects, we preserve the structural JSON to maintain
    // the ability to reconstruct the parts if needed from the saved output.
    return JSON.stringify(content, null, 2);
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

    // If the output is massively oversized, attempt to generate an intent summary
    let intentSummaryText = '';
    const summarizationThresholdTokens =
      this.config.getToolSummarizationThresholdTokens();
    const summarizationThresholdChars = summarizationThresholdTokens * 4;

    if (
      originalContentLength > summarizationThresholdChars &&
      originalContentLength <= MAX_DISTILLATION_SIZE
    ) {
      const summary = await this.generateIntentSummary(
        toolName,
        stringifiedContent,
        Math.floor(MAX_DISTILLATION_SIZE),
      );

      if (summary) {
        intentSummaryText = `\n\n--- Strategic Significance of Truncated Content ---\n${summary}`;
      }
    }

    // Perform structural truncation
    const ratio = threshold / originalContentLength;
    const truncatedContent = this.truncateContentStructurally(
      content,
      ratio,
      savedPath || 'Output offloaded to disk',
      intentSummaryText,
    );

    logToolOutputTruncated(
      this.config,
      new ToolOutputTruncatedEvent(this.promptId, {
        toolName,
        originalContentLength,
        truncatedContentLength: this.calculateContentLength(truncatedContent),
        threshold,
      }),
    );

    return {
      truncatedContent,
      outputFile: savedPath,
    };
  }

  /**
   * Truncates content while maintaining its Part structure.
   */
  private truncateContentStructurally(
    content: PartListUnion,
    ratio: number,
    savedPath: string,
    intentSummary: string,
  ): PartListUnion {
    if (typeof content === 'string') {
      const targetTokens = Math.max(
        MIN_TARGET_TOKENS,
        Math.floor((content.length / 4) * ratio),
      );
      const targetChars = estimateCharsFromTokens(content, targetTokens);

      return (
        truncateProportionally(content, targetChars, TOOL_TRUNCATION_PREFIX) +
        `\n\nFull output saved to: ${savedPath}` +
        intentSummary
      );
    }

    if (!Array.isArray(content)) return content;

    return content.map((part) => {
      if (typeof part === 'string') {
        const text = part;
        const targetTokens = Math.max(
          MIN_TARGET_TOKENS,
          Math.floor((text.length / 4) * ratio),
        );
        const targetChars = estimateCharsFromTokens(text, targetTokens);
        return truncateProportionally(
          text,
          targetChars,
          TOOL_TRUNCATION_PREFIX,
        );
      }

      if (part.text) {
        const text = part.text;
        const targetTokens = Math.max(
          MIN_TARGET_TOKENS,
          Math.floor((text.length / 4) * ratio),
        );
        const targetChars = estimateCharsFromTokens(text, targetTokens);
        return {
          text:
            truncateProportionally(text, targetChars, TOOL_TRUNCATION_PREFIX) +
            `\n\nFull output saved to: ${savedPath}` +
            intentSummary,
        };
      }

      if (part.functionResponse) {
        return normalizeFunctionResponse(
          part,
          ratio,
          0.2, // default headRatio
          savedPath,
          intentSummary,
        );
      }

      return part;
    });
  }

  /**
   * Calls the secondary model to distill the strategic "why" signals and intent
   * of the truncated content before it is offloaded.
   */
  private async generateIntentSummary(
    toolName: string,
    stringifiedContent: string,
    maxPreviewLen: number,
  ): Promise<string | undefined> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const promptText = `The following output from the tool '${toolName}' is large and has been truncated. Extract the most critical factual information from this output so the main agent doesn't lose context.

Focus strictly on concrete data points:
1. Exact error messages, exception types, or exit codes.
2. Specific file paths or line numbers mentioned.
3. Definitive outcomes (e.g., 'Compilation succeeded', '3 tests failed').

Do not philosophize about the strategic intent. Keep the extraction under 10 lines and use exact quotes where helpful.

Output to summarize:
${stringifiedContent.slice(0, maxPreviewLen)}...`;

      const summaryResponse = await this.geminiClient.generateContent(
        { model: 'agent-history-provider-summarizer' },
        [{ role: 'user', parts: [{ text: promptText }] }],
        controller.signal,
        LlmRole.UTILITY_COMPRESSOR,
      );

      clearTimeout(timeoutId);

      return summaryResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
      // Fail gracefully, summarization is a progressive enhancement
      debugLogger.debug(
        'Failed to generate intent summary for truncated output:',
        e instanceof Error ? e.message : String(e),
      );
      return undefined;
    }
  }
}
