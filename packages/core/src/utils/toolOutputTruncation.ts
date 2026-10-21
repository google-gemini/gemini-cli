/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ToolOutputDistillationService } from '../context/toolDistillationService.js';
import { logToolOutputTruncated } from '../telemetry/loggers.js';
import { ToolOutputTruncatedEvent } from '../telemetry/types.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import type { AnyDeclarativeTool } from '../tools/tools.js';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from './constants.js';
import {
  formatTruncatedToolOutput,
  saveTruncatedToolOutput,
} from './fileUtils.js';
import { truncateToolOutput } from './tool-utils.js';

export interface ToolOutputTruncationRequest {
  context: AgentLoopContext;
  toolName: string;
  callId: string;
  tool?: AnyDeclarativeTool;
  content: PartListUnion;
}

export interface ToolOutputTruncationResult {
  truncatedContent: PartListUnion;
  outputFile?: string;
}

/**
 * Bounds the content a tool produced before it is handed back to the model.
 *
 * Shell and single-text-part MCP output beyond
 * `tools.truncateToolOutputThreshold` keeps its head and tail, and the full
 * output is saved to a file whose path is included in the returned content.
 * Any other content beyond `MAX_STORED_TOOL_OUTPUT_BYTES` is capped the same
 * way. Every path that turns a tool result into a function response has to call
 * this, otherwise oversized output reaches the model unmodified.
 */
export async function truncateToolOutputIfNeeded(
  request: ToolOutputTruncationRequest,
): Promise<ToolOutputTruncationResult> {
  const { context, toolName, callId, tool, content } = request;
  const config = context.config;

  if (config.isContextManagementEnabled()) {
    const distiller = new ToolOutputDistillationService(
      config,
      context.geminiClient,
      context.promptId,
    );
    return distiller.distill(toolName, callId, content);
  }

  let outputFile: string | undefined;

  if (typeof content === 'string' && toolName === SHELL_TOOL_NAME) {
    const threshold = config.getTruncateToolOutputThreshold();

    if (threshold > 0 && content.length > threshold) {
      const originalContentLength = content.length;
      const { outputFile: savedPath } = await saveTruncatedToolOutput(
        content,
        toolName,
        callId,
        config.storage.getProjectTempDir(),
        context.promptId,
      );
      outputFile = savedPath;
      let truncatedContent = formatTruncatedToolOutput(
        content,
        outputFile,
        threshold,
      );

      logToolOutputTruncated(
        config,
        new ToolOutputTruncatedEvent(context.promptId, {
          toolName,
          originalContentLength,
          truncatedContentLength: truncatedContent.length,
          threshold,
        }),
      );

      if (
        typeof truncatedContent === 'string' &&
        Buffer.byteLength(truncatedContent, 'utf8') >
          MAX_STORED_TOOL_OUTPUT_BYTES
      ) {
        truncatedContent = truncateToolOutput(
          truncatedContent,
          MAX_STORED_TOOL_OUTPUT_BYTES,
        );
      }

      return { truncatedContent, outputFile };
    }
  } else if (
    Array.isArray(content) &&
    content.length === 1 &&
    tool instanceof DiscoveredMCPTool
  ) {
    const firstPart = content[0];
    if (typeof firstPart === 'object' && typeof firstPart.text === 'string') {
      const textContent = firstPart.text;
      const threshold = config.getTruncateToolOutputThreshold();

      if (threshold > 0 && textContent.length > threshold) {
        const originalContentLength = textContent.length;
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          textContent,
          toolName,
          callId,
          config.storage.getProjectTempDir(),
          context.promptId,
        );
        outputFile = savedPath;
        let truncatedText = formatTruncatedToolOutput(
          textContent,
          outputFile,
          threshold,
        );

        if (
          typeof truncatedText === 'string' &&
          Buffer.byteLength(truncatedText, 'utf8') >
            MAX_STORED_TOOL_OUTPUT_BYTES
        ) {
          truncatedText = truncateToolOutput(
            truncatedText,
            MAX_STORED_TOOL_OUTPUT_BYTES,
          );
        }

        const truncatedContent: Part[] = [
          { ...firstPart, text: truncatedText },
        ];

        logToolOutputTruncated(
          config,
          new ToolOutputTruncatedEvent(context.promptId, {
            toolName,
            originalContentLength,
            truncatedContentLength: truncatedText.length,
            threshold,
          }),
        );

        return { truncatedContent, outputFile };
      }
    }
  }

  const ensureOutputFile = async (
    rawText: string,
  ): Promise<string | undefined> => {
    if (!outputFile) {
      try {
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          rawText,
          toolName,
          callId,
          config.storage.getProjectTempDir(),
          context.promptId,
        );
        outputFile = savedPath;
      } catch {
        // Ignore error during disk save
      }
    }
    return outputFile;
  };

  let finalContent: PartListUnion = content;
  if (typeof finalContent === 'string') {
    if (
      Buffer.byteLength(finalContent, 'utf8') > MAX_STORED_TOOL_OUTPUT_BYTES
    ) {
      const savedPath = await ensureOutputFile(finalContent);
      finalContent = truncateToolOutput(
        finalContent,
        MAX_STORED_TOOL_OUTPUT_BYTES,
        savedPath,
      );
    }
  } else if (Array.isArray(finalContent)) {
    finalContent = await Promise.all(
      finalContent.map(async (part) => {
        if (
          typeof part === 'string' &&
          Buffer.byteLength(part, 'utf8') > MAX_STORED_TOOL_OUTPUT_BYTES
        ) {
          const savedPath = await ensureOutputFile(part);
          return truncateToolOutput(
            part,
            MAX_STORED_TOOL_OUTPUT_BYTES,
            savedPath,
          );
        }
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof part.text === 'string' &&
          Buffer.byteLength(part.text, 'utf8') > MAX_STORED_TOOL_OUTPUT_BYTES
        ) {
          const savedPath = await ensureOutputFile(part.text);
          return {
            ...part,
            text: truncateToolOutput(
              part.text,
              MAX_STORED_TOOL_OUTPUT_BYTES,
              savedPath,
            ),
          };
        }
        return part;
      }),
    );
  } else if (
    typeof finalContent === 'object' &&
    finalContent !== null &&
    'text' in finalContent &&
    typeof finalContent.text === 'string' &&
    Buffer.byteLength(finalContent.text, 'utf8') > MAX_STORED_TOOL_OUTPUT_BYTES
  ) {
    const savedPath = await ensureOutputFile(finalContent.text);
    finalContent = {
      ...finalContent,
      text: truncateToolOutput(
        finalContent.text,
        MAX_STORED_TOOL_OUTPUT_BYTES,
        savedPath,
      ),
    };
  }

  return { truncatedContent: finalContent, outputFile };
}
