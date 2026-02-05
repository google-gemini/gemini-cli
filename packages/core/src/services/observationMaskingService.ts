/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import { logObservationMasking } from '../telemetry/loggers.js';
import {
  SHELL_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { ObservationMaskingEvent } from '../telemetry/types.js';

// Observation masking defaults
export const DEFAULT_TOOL_PROTECTION_THRESHOLD = 50000;
export const DEFAULT_HYSTERESIS_THRESHOLD = 30000;
export const DEFAULT_PROTECT_LATEST_TURN = true;

export const OBSERVATION_DIR = 'observations';

export interface MaskingResult {
  newHistory: Content[];
  maskedCount: number;
  tokensSaved: number;
}

/**
 * Service to manage context window by masking bulky tool outputs (Observation Masking).
 * Follows a Hybrid Backward Scanned FIFO algorithm:
 * 1. Protect newest 50k tool tokens (optionally skipping the entire latest turn).
 * 2. Identify ALL tool outputs beyond the protection window for global aggregation.
 * 3. Trigger masking if the total prunable tokens exceed 30k.
 */
export class ObservationMaskingService {
  async mask(history: Content[], config: Config): Promise<MaskingResult> {
    if (history.length === 0) {
      return { newHistory: history, maskedCount: 0, tokensSaved: 0 };
    }

    let cumulativeToolTokens = 0;
    let protectionBoundaryReached = false;
    let totalPrunableTokens = 0;
    let maskedCount = 0;

    const prunableParts: Array<{
      contentIndex: number;
      partIndex: number;
      tokens: number;
      content: string;
      originalPart: Part;
    }> = [];

    const maskingConfig = config.getObservationMaskingConfig();

    // Decide where to start scanning.
    // If PROTECT_LATEST_TURN is true, we skip the most recent message (index history.length - 1).
    const scanStartIdx = maskingConfig.protectLatestTurn
      ? history.length - 2
      : history.length - 1;

    // Step 1: Backward scan to identify prunable tool outputs
    for (let i = scanStartIdx; i >= 0; i--) {
      const content = history[i];
      const parts = content.parts || [];

      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];

        // We only care about tool responses (observations)
        if (!part.functionResponse) continue;

        const observationContent = this.getObservationContent(part);
        if (!observationContent || this.isAlreadyMasked(observationContent)) {
          continue;
        }

        const partTokens = estimateTokenCountSync([part]);

        if (!protectionBoundaryReached) {
          cumulativeToolTokens += partTokens;
          if (cumulativeToolTokens > maskingConfig.toolProtectionThreshold) {
            protectionBoundaryReached = true;
            // The part that crossed the boundary is prunable.
            totalPrunableTokens += partTokens;
            prunableParts.push({
              contentIndex: i,
              partIndex: j,
              tokens: partTokens,
              content: observationContent,
              originalPart: part,
            });
          }
        } else {
          totalPrunableTokens += partTokens;
          prunableParts.push({
            contentIndex: i,
            partIndex: j,
            tokens: partTokens,
            content: observationContent,
            originalPart: part,
          });
        }
      }
    }

    // Step 2: Hysteresis trigger
    if (totalPrunableTokens < maskingConfig.hysteresisThreshold) {
      return { newHistory: history, maskedCount: 0, tokensSaved: 0 };
    }

    debugLogger.debug(
      `[ObservationMasking] Triggering masking. Prunable tool tokens: ${totalPrunableTokens.toLocaleString()} (> ${maskingConfig.hysteresisThreshold.toLocaleString()})`,
    );

    // Step 3: Perform masking and offloading
    const newHistory = [...history]; // Shallow copy of history
    let actualTokensSaved = 0;
    const observationDir = path.join(
      config.storage.getHistoryDir(),
      OBSERVATION_DIR,
    );
    await fsPromises.mkdir(observationDir, { recursive: true });

    for (const item of prunableParts) {
      const { contentIndex, partIndex, content, tokens } = item;
      const contentRecord = newHistory[contentIndex];
      const part = contentRecord.parts![partIndex];

      if (!part.functionResponse) continue;

      const toolName = part.functionResponse.name || 'unknown_tool';
      const callId = part.functionResponse.id || Date.now().toString();
      const fileName = `${toolName}_${callId}_${Math.random()
        .toString(36)
        .substring(7)}.txt`;
      const filePath = path.join(observationDir, fileName);

      await fsPromises.writeFile(filePath, content, 'utf-8');

      const originalResponse =
        (part.functionResponse.response as Record<string, unknown>) || {};

      const totalLines = content.split('\n').length;
      const fileSizeMB = (
        Buffer.byteLength(content, 'utf8') /
        1024 /
        1024
      ).toFixed(2);

      let preview = '';
      if (toolName === SHELL_TOOL_NAME) {
        preview = this.formatShellPreview(originalResponse);
      } else {
        // General tools: Head + Tail preview (250 chars each)
        if (content.length > 500) {
          preview = `${content.slice(0, 250)}\n... [TRUNCATED] ...\n${content.slice(-250)}`;
        } else {
          preview = content;
        }
      }

      const maskedSnippet = this.formatMaskedSnippet({
        toolName,
        filePath,
        fileSizeMB,
        totalLines,
        tokens,
        preview,
      });

      const maskedPart = {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          response: { output: maskedSnippet },
        },
      };

      const newTaskTokens = estimateTokenCountSync([maskedPart]);
      const savings = tokens - newTaskTokens;

      if (savings > 0) {
        const newParts = [...contentRecord.parts!];
        newParts[partIndex] = maskedPart;
        newHistory[contentIndex] = { ...contentRecord, parts: newParts };
        actualTokensSaved += savings;
        maskedCount++;
      }
    }

    debugLogger.debug(
      `[ObservationMasking] Masked ${maskedCount} tool outputs. Saved ~${actualTokensSaved.toLocaleString()} tokens.`,
    );

    const result = {
      newHistory,
      maskedCount,
      tokensSaved: actualTokensSaved,
    };

    if (actualTokensSaved <= 0) {
      return result;
    }

    logObservationMasking(
      config,
      new ObservationMaskingEvent({
        tokens_before: totalPrunableTokens,
        tokens_after: totalPrunableTokens - actualTokensSaved,
        masked_count: prunableParts.length,
        total_prunable_tokens: totalPrunableTokens,
      }),
    );

    return result;
  }

  private getObservationContent(part: Part): string | null {
    if (!part.functionResponse) return null;
    const response = part.functionResponse.response as Record<string, unknown>;
    if (!response) return null;

    // Stringify the entire response for saving.
    // This handles any tool output schema automatically.
    const content = JSON.stringify(response, null, 2);

    // Multimodal safety check: Sibling parts (inlineData, etc.) are handled by mask()
    // by keeping the original part structure and only replacing the functionResponse content.

    return content;
  }

  private isAlreadyMasked(content: string): boolean {
    return content.includes('<observation_masked_guidance');
  }

  private formatShellPreview(response: Record<string, unknown>): string {
    const content = (response['output'] || response['stdout'] || '') as string;
    if (typeof content !== 'string') {
      return typeof content === 'object'
        ? JSON.stringify(content)
        : String(content);
    }

    // The shell tool output is structured in shell.ts with specific section prefixes:
    const sectionRegex =
      /^(Output|Error|Exit Code|Signal|Background PIDs|Process Group PGID): /m;
    const parts = content.split(sectionRegex);

    if (parts.length < 3) {
      // Fallback to simple head/tail if not in expected shell.ts format
      return this.formatSimplePreview(content);
    }

    const previewParts: string[] = [];
    if (parts[0].trim()) {
      previewParts.push(this.formatSimplePreview(parts[0].trim()));
    }

    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i];
      const sectionContent = parts[i + 1]?.trim() || '';

      if (name === 'Output') {
        previewParts.push(
          `Output: ${this.formatSimplePreview(sectionContent)}`,
        );
      } else {
        // Keep other sections (Error, Exit Code, etc.) in full as they are usually high-signal and small
        previewParts.push(`${name}: ${sectionContent}`);
      }
    }

    let preview = previewParts.join('\n');

    // Also check root levels just in case some tool uses them or for future-proofing
    const exitCode = response['exitCode'] ?? response['exit_code'];
    const error = response['error'];
    if (
      exitCode !== undefined &&
      exitCode !== 0 &&
      exitCode !== null &&
      !content.includes(`Exit Code: ${exitCode}`)
    ) {
      preview += `\n[Exit Code: ${exitCode}]`;
    }
    if (error && !content.includes(`Error: ${error}`)) {
      preview += `\n[Error: ${error}]`;
    }

    return preview;
  }

  private formatSimplePreview(content: string): string {
    const lines = content.split('\n');
    if (lines.length <= 20) return content;
    const head = lines.slice(0, 10);
    const tail = lines.slice(-10);
    return `${head.join('\n')}\n\n... [${
      lines.length - head.length - tail.length
    } lines omitted] ...\n\n${tail.join('\n')}`;
  }

  private formatMaskedSnippet(params: MaskedSnippetParams): string {
    const { toolName, filePath, fileSizeMB, totalLines, tokens, preview } =
      params;
    return `[Observation Masked]
<observation_masked_guidance tool_name="${toolName}">
  <preview>${preview}</preview>
  <details>
    <file_path>${filePath}</file_path>
    <file_size>${fileSizeMB}MB</file_size>
    <line_count>${totalLines.toLocaleString()}</line_count>
    <estimated_total_tokens>${tokens.toLocaleString()}</estimated_total_tokens>
  </details>
  <instructions>
    The full output is available at the path above. 
    You can inspect it using tools like '${GREP_TOOL_NAME}' or '${READ_FILE_TOOL_NAME}'.
    Note: Reading the full file will use approximately ${tokens.toLocaleString()} tokens.
  </instructions>
</observation_masked_guidance>`;
  }
}

interface MaskedSnippetParams {
  toolName: string;
  filePath: string;
  fileSizeMB: string;
  totalLines: number;
  tokens: number;
  preview: string;
}
