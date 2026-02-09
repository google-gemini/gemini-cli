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
import { sanitizeFilenamePart } from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { logToolOutputMasking } from '../telemetry/loggers.js';
import {
  SHELL_TOOL_NAME,
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../tools/tool-names.js';
import { ToolOutputMaskingEvent } from '../telemetry/types.js';

// Tool output masking defaults
export const DEFAULT_TOOL_PROTECTION_THRESHOLD = 50000;
export const DEFAULT_MIN_PRUNABLE_TOKENS_THRESHOLD = 30000;
export const DEFAULT_PROTECT_LATEST_TURN = true;
export const MASKING_INDICATOR_TAG = 'tool_output_masked';

export const TOOL_OUTPUTS_DIR = 'tool-outputs';

/**
 * Tools whose outputs are always high-signal and should never be masked,
 * regardless of their position in the conversation history.
 */
const EXEMPT_TOOLS = new Set([
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
]);

export interface MaskingResult {
  newHistory: Content[];
  maskedCount: number;
  tokensSaved: number;
}

/**
 * Service to manage context window efficiency by masking bulky tool outputs (Tool Output Masking).
 *
 * It implements a "Hybrid Backward Scanned FIFO" algorithm to balance context relevance with
 * token savings:
 * 1. **Protection Window**: Protects the newest `toolProtectionThreshold` (default 50k) tool tokens
 *    from pruning. Optionally skips the entire latest conversation turn to ensure full context for
 *    the model's next response.
 * 2. **Global Aggregation**: Scans backwards past the protection window to identify all remaining
 *    tool outputs that haven't been masked yet.
 * 3. **Batch Trigger**: Trigger masking only if the total prunable tokens exceed
 *    `minPrunableTokensThreshold` (default 30k).
 *
 * @remarks
 * Effectively, this means masking only starts once the conversation contains approximately 80k
 * tokens of prunable tool outputs (50k protected + 30k prunable buffer). Small tool outputs
 * are preserved until they collectively reach the threshold.
 */
export class ToolOutputMaskingService {
  async mask(history: Content[], config: Config): Promise<MaskingResult> {
    const maskingConfig = await config.getToolOutputMaskingConfig();
    if (!maskingConfig.enabled || history.length === 0) {
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

    // Decide where to start scanning.
    // If PROTECT_LATEST_TURN is true, we skip the most recent message (index history.length - 1).
    const scanStartIdx = maskingConfig.protectLatestTurn
      ? history.length - 2
      : history.length - 1;

    // Backward scan to identify prunable tool outputs
    for (let i = scanStartIdx; i >= 0; i--) {
      const content = history[i];
      const parts = content.parts || [];

      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];

        // Tool outputs (functionResponse) are the primary targets for pruning because
        // they often contain voluminous data (e.g., shell logs, file content) that
        // can exceed context limits. We preserve other parts—such as user text,
        // model reasoning, and multimodal data—because they define the conversation's
        // core intent and logic, which are harder for the model to recover if lost.
        if (!part.functionResponse) continue;

        const toolName = part.functionResponse.name;
        if (toolName && EXEMPT_TOOLS.has(toolName)) {
          continue;
        }

        const toolOutputContent = this.getToolOutputContent(part);
        if (!toolOutputContent || this.isAlreadyMasked(toolOutputContent)) {
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
              content: toolOutputContent,
              originalPart: part,
            });
          }
        } else {
          totalPrunableTokens += partTokens;
          prunableParts.push({
            contentIndex: i,
            partIndex: j,
            tokens: partTokens,
            content: toolOutputContent,
            originalPart: part,
          });
        }
      }
    }

    // Trigger pruning only if we have accumulated enough savings to justify the
    // overhead of masking and file I/O (batch pruning threshold).
    if (totalPrunableTokens < maskingConfig.minPrunableTokensThreshold) {
      return { newHistory: history, maskedCount: 0, tokensSaved: 0 };
    }

    debugLogger.debug(
      `[ToolOutputMasking] Triggering masking. Prunable tool tokens: ${totalPrunableTokens.toLocaleString()} (> ${maskingConfig.minPrunableTokensThreshold.toLocaleString()})`,
    );

    // Perform masking and offloading
    const newHistory = [...history]; // Shallow copy of history
    let actualTokensSaved = 0;
    let toolOutputsDir = path.join(
      config.storage.getProjectTempDir(),
      TOOL_OUTPUTS_DIR,
    );
    const sessionId = config.getSessionId();
    if (sessionId) {
      const safeSessionId = sanitizeFilenamePart(sessionId);
      toolOutputsDir = path.join(toolOutputsDir, `session-${safeSessionId}`);
    }
    await fsPromises.mkdir(toolOutputsDir, { recursive: true });

    for (const item of prunableParts) {
      const { contentIndex, partIndex, content, tokens } = item;
      const contentRecord = newHistory[contentIndex];
      const part = contentRecord.parts![partIndex];

      if (!part.functionResponse) continue;

      const toolName = part.functionResponse.name || 'unknown_tool';
      const callId = part.functionResponse.id || Date.now().toString();
      const safeToolName = sanitizeFilenamePart(toolName).toLowerCase();
      const safeCallId = sanitizeFilenamePart(callId).toLowerCase();
      const fileName = `${safeToolName}_${safeCallId}_${Math.random()
        .toString(36)
        .substring(7)}.txt`;
      const filePath = path.join(toolOutputsDir, fileName);

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
      `[ToolOutputMasking] Masked ${maskedCount} tool outputs. Saved ~${actualTokensSaved.toLocaleString()} tokens.`,
    );

    const result = {
      newHistory,
      maskedCount,
      tokensSaved: actualTokensSaved,
    };

    if (actualTokensSaved <= 0) {
      return result;
    }

    logToolOutputMasking(
      config,
      new ToolOutputMaskingEvent({
        tokens_before: totalPrunableTokens,
        tokens_after: totalPrunableTokens - actualTokensSaved,
        masked_count: maskedCount,
        total_prunable_tokens: totalPrunableTokens,
      }),
    );

    return result;
  }

  private getToolOutputContent(part: Part): string | null {
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
    return content.includes(`<${MASKING_INDICATOR_TAG}`);
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
    const { filePath, preview } = params;
    return `<${MASKING_INDICATOR_TAG}>
${preview}

Output too large. Full output available at: ${filePath}
</${MASKING_INDICATOR_TAG}>`;
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
