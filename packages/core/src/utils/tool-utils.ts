/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isTool,
  type AnyDeclarativeTool,
  type AnyToolInvocation,
} from '../index.js';
import { SHELL_TOOL_NAMES } from './shell-utils.js';
import {
  UPDATE_TOPIC_TOOL_NAME,
  EDIT_TOOL_NAMES,
  SHELL_TOOL_NAME,
} from '../tools/tool-names.js';
import levenshtein from 'fast-levenshtein';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../scheduler/types.js';
import type { Part, PartListUnion, PartUnion } from '@google/genai';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from './constants.js';
import {
  saveTruncatedToolOutput,
  formatTruncatedToolOutput,
} from './fileUtils.js';
import {
  ToolOutputTruncatedEvent,
  logToolOutputTruncated,
} from '../telemetry/index.js';
import type { Config } from '../config/config.js';

/**
 * Determines whether a tool call request can be executed in parallel with
 * other parallelizable tool calls in the same scheduler wave.
 */
export function isParallelizable(request: ToolCallRequestInfo): boolean {
  if (
    request.name === UPDATE_TOPIC_TOOL_NAME ||
    EDIT_TOOL_NAMES.has(request.name)
  ) {
    return false;
  }
  const wait = request.args?.['wait_for_previous'];
  if (typeof wait === 'boolean') {
    return !wait;
  }
  return true;
}

/**
 * Validates if an object is a ToolCallResponseInfo.
 */
export function isToolCallResponseInfo(
  data: unknown,
): data is ToolCallResponseInfo {
  return (
    typeof data === 'object' &&
    data !== null &&
    'callId' in data &&
    'responseParts' in data
  );
}

/**
 * Generates a suggestion string for a tool name that was not found in the registry.
 * It finds the closest matches based on Levenshtein distance.
 * @param unknownToolName The tool name that was not found.
 * @param allToolNames The list of all available tool names.
 * @param topN The number of suggestions to return. Defaults to 3.
 * @returns A suggestion string like " Did you mean 'tool'?" or " Did you mean one of: 'tool1', 'tool2'?", or an empty string if no suggestions are found.
 */
export function getToolSuggestion(
  unknownToolName: string,
  allToolNames: string[],
  topN = 3,
): string {
  const matches = allToolNames.map((toolName) => ({
    name: toolName,
    distance: levenshtein.get(unknownToolName, toolName),
  }));

  matches.sort((a, b) => a.distance - b.distance);

  const topNResults = matches.slice(0, topN);

  if (topNResults.length === 0) {
    return '';
  }

  const suggestedNames = topNResults
    .map((match) => `"${match.name}"`)
    .join(', ');

  if (topNResults.length > 1) {
    return ` Did you mean one of: ${suggestedNames}?`;
  } else {
    return ` Did you mean ${suggestedNames}?`;
  }
}

/**
 * Checks if a tool invocation matches any of a list of patterns.
 *
 * @param toolOrToolName The tool object or the name of the tool being invoked.
 * @param invocation The invocation object for the tool or the command invoked.
 * @param patterns A list of patterns to match against.
 *   Patterns can be:
 *   - A tool name (e.g., "ReadFileTool") to match any invocation of that tool.
 *   - A tool name with a prefix (e.g., "ShellTool(git status)") to match
 *     invocations where the arguments start with that prefix.
 * @returns True if the invocation matches any pattern, false otherwise.
 */
export function doesToolInvocationMatch(
  toolOrToolName: AnyDeclarativeTool | string,
  invocation: AnyToolInvocation | string,
  patterns: string[],
): boolean {
  let toolNames: string[];
  if (isTool(toolOrToolName)) {
    toolNames = [toolOrToolName.name, toolOrToolName.constructor.name];
  } else {
    toolNames = [toolOrToolName];
  }

  if (toolNames.some((name) => SHELL_TOOL_NAMES.includes(name))) {
    toolNames = [...new Set([...toolNames, ...SHELL_TOOL_NAMES])];
  }

  for (const pattern of patterns) {
    const openParen = pattern.indexOf('(');

    if (openParen === -1) {
      // No arguments, just a tool name
      if (toolNames.includes(pattern)) {
        return true;
      }
      continue;
    }

    const patternToolName = pattern.substring(0, openParen);
    if (!toolNames.includes(patternToolName)) {
      continue;
    }

    if (!pattern.endsWith(')')) {
      continue;
    }

    const argPattern = pattern.substring(openParen + 1, pattern.length - 1);

    let command: string;
    if (typeof invocation === 'string') {
      command = invocation;
    } else {
      if (!('command' in invocation.params)) {
        // This invocation has no command - nothing to check.
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      command = String((invocation.params as { command: string }).command);
    }

    if (toolNames.some((name) => SHELL_TOOL_NAMES.includes(name))) {
      if (command === argPattern || command.startsWith(argPattern + ' ')) {
        return true;
      }
    }
  }

  return false;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Truncates large tool execution output to stay within a maximum byte cap using
 * grapheme-cluster-aware segmentation (Intl.Segmenter). This prevents cutting in
 * the middle of surrogate pairs or multi-byte Unicode characters / emojis.
 *
 * @param text The raw tool output string.
 * @param maxBytes Maximum allowed bytes (defaults to MAX_STORED_TOOL_OUTPUT_BYTES = 64 KB).
 * @param savedFilePath Optional file path where the complete raw output was saved.
 * @returns The output truncated to at most maxBytes.
 */
export function truncateToolOutput(
  text: string,
  maxBytes: number = MAX_STORED_TOOL_OUTPUT_BYTES,
  savedFilePath?: string,
): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }

  const suffix = savedFilePath
    ? `\n... [Tool output truncated to conserve memory. For full output see: ${savedFilePath}]`
    : '\n... [Tool output truncated to conserve memory]';
  const targetBytes = Math.max(0, maxBytes - Buffer.byteLength(suffix, 'utf8'));

  let accumulatedBytes = 0;
  let truncatedText = '';

  for (const { segment } of segmenter.segment(text)) {
    const segmentBytes = Buffer.byteLength(segment, 'utf8');
    if (accumulatedBytes + segmentBytes > targetBytes) {
      break;
    }
    accumulatedBytes += segmentBytes;
    truncatedText += segment;
  }

  return truncatedText + suffix;
}

/**
 * Truncates large tool response fields in a Gemini Part to keep stored chat history bounded.
 */
export function truncateFunctionResponsePart(
  part: Part,
  maxBytes: number = MAX_STORED_TOOL_OUTPUT_BYTES,
  savedFilePath?: string,
): Part {
  if (part.text && Buffer.byteLength(part.text, 'utf8') > maxBytes) {
    return {
      ...part,
      text: truncateToolOutput(part.text, maxBytes, savedFilePath),
    };
  }

  if (!part.functionResponse?.response) {
    return part;
  }

  const resp: unknown = part.functionResponse.response;
  if (typeof resp === 'string') {
    if (Buffer.byteLength(resp, 'utf8') > maxBytes) {
      return {
        ...part,
        functionResponse: {
          // eslint-disable-next-line @typescript-eslint/no-misused-spread
          ...part.functionResponse,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          response: truncateToolOutput(
            resp,
            maxBytes,
            savedFilePath,
          ) as unknown as Record<string, unknown>,
        },
      };
    }
    return part;
  }

  if (typeof resp === 'object' && resp !== null) {
    const truncateValue = (val: unknown): unknown => {
      if (typeof val === 'string') {
        if (Buffer.byteLength(val, 'utf8') > maxBytes) {
          return truncateToolOutput(val, maxBytes, savedFilePath);
        }
        return val;
      }

      if (Array.isArray(val)) {
        let arrayModified = false;
        const newVal = val.map((item) => {
          const truncated = truncateValue(item);
          if (truncated !== item) {
            arrayModified = true;
          }
          return truncated;
        });
        return arrayModified ? newVal : val;
      }

      if (typeof val === 'object' && val !== null) {
        // Safeguard: do not recursively traverse non-plain objects like Buffer, TypedArray, Date, etc.
        const proto: unknown = Object.getPrototypeOf(val);
        if (proto !== Object.prototype && proto !== null) {
          return val;
        }

        let objModified = false;
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
          const truncated = truncateValue(v);
          if (truncated !== v) {
            objModified = true;
          }
          copy[k] = truncated;
        }
        return objModified ? copy : val;
      }

      return val;
    };

    const newResp = truncateValue(resp);
    if (newResp !== resp) {
      return {
        ...part,
        functionResponse: {
          // eslint-disable-next-line @typescript-eslint/no-misused-spread
          ...part.functionResponse,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          response: newResp as Record<string, unknown>,
        },
      };
    }
  }

  return part;
}

export interface TruncateToolOutputOptions {
  toolName: string;
  callId: string;
  promptId?: string;
  isMcp?: boolean;
  config: Config;
}

/**
 * Truncates tool output if it exceeds configured threshold (for shell or MCP tools)
 * or if it exceeds the maximum byte limit (MAX_STORED_TOOL_OUTPUT_BYTES = 64KB).
 * Full raw output is saved to disk and a formatted truncated preview is returned.
 *
 * @param content The raw tool output (string, Part[], Part, etc.).
 * @param options Tool and configuration options for truncation.
 * @returns An object containing the truncated content and the path to the saved file (if any).
 */
export async function truncateToolOutputIfNeeded(
  content: PartListUnion,
  options: TruncateToolOutputOptions,
): Promise<{ truncatedContent: PartListUnion; outputFile?: string }> {
  const { toolName, callId, promptId, isMcp, config } = options;
  let outputFile: string | undefined;

  const isShellTool =
    typeof content === 'string' &&
    (toolName === SHELL_TOOL_NAME || SHELL_TOOL_NAMES.includes(toolName));

  if (isShellTool) {
    const threshold = config.getTruncateToolOutputThreshold();

    if (threshold > 0 && content.length > threshold) {
      const originalContentLength = content.length;
      const projectTempDir = config.storage?.getProjectTempDir?.();
      if (projectTempDir) {
        const { outputFile: savedPath } = await saveTruncatedToolOutput(
          content,
          toolName,
          callId,
          projectTempDir,
          promptId,
        );
        outputFile = savedPath;
      }
      let truncatedContent = formatTruncatedToolOutput(
        content,
        outputFile ?? '',
        threshold,
      );

      logToolOutputTruncated(
        config,
        new ToolOutputTruncatedEvent(promptId, {
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
    isMcp
  ) {
    const firstPart = content[0];
    if (
      typeof firstPart === 'object' &&
      firstPart !== null &&
      'text' in firstPart &&
      typeof firstPart.text === 'string'
    ) {
      const textContent = firstPart.text;
      const threshold = config.getTruncateToolOutputThreshold();

      if (threshold > 0 && textContent.length > threshold) {
        const originalContentLength = textContent.length;
        const projectTempDir = config.storage?.getProjectTempDir?.();
        if (projectTempDir) {
          const { outputFile: savedPath } = await saveTruncatedToolOutput(
            textContent,
            toolName,
            callId,
            projectTempDir,
            promptId,
          );
          outputFile = savedPath;
        }
        let truncatedText = formatTruncatedToolOutput(
          textContent,
          outputFile ?? '',
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
          new ToolOutputTruncatedEvent(promptId, {
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
        const projectTempDir = config.storage?.getProjectTempDir?.();
        if (projectTempDir) {
          const { outputFile: savedPath } = await saveTruncatedToolOutput(
            rawText,
            toolName,
            callId,
            projectTempDir,
            promptId,
          );
          outputFile = savedPath;
        }
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
    const textParts: string[] = [];
    let totalBytes = 0;
    for (const part of finalContent) {
      const text =
        typeof part === 'string'
          ? part
          : typeof part === 'object' &&
              part !== null &&
              'text' in part &&
              typeof part.text === 'string'
            ? part.text
            : undefined;
      if (text !== undefined) {
        if (textParts.length > 0) {
          totalBytes += 1;
        }
        textParts.push(text);
        totalBytes += Buffer.byteLength(text, 'utf8');
      }
    }
    if (totalBytes > MAX_STORED_TOOL_OUTPUT_BYTES) {
      await ensureOutputFile(textParts.join('\n'));
    }

    let remainingBytes = MAX_STORED_TOOL_OUTPUT_BYTES;
    let budgetExhausted = false;
    const processedParts: PartUnion[] = [];

    for (const part of finalContent) {
      if (typeof part === 'string') {
        if (budgetExhausted) {
          continue;
        }
        const partBytes = Buffer.byteLength(part, 'utf8');
        if (partBytes > remainingBytes) {
          const savedPath = await ensureOutputFile(part);
          processedParts.push(
            truncateToolOutput(part, remainingBytes, savedPath),
          );
          budgetExhausted = true;
          remainingBytes = 0;
        } else {
          processedParts.push(part);
          remainingBytes = Math.max(0, remainingBytes - partBytes - 1);
        }
      } else if (
        typeof part === 'object' &&
        part !== null &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        if (budgetExhausted) {
          continue;
        }
        const partBytes = Buffer.byteLength(part.text, 'utf8');
        if (partBytes > remainingBytes) {
          const savedPath = await ensureOutputFile(part.text);
          processedParts.push({
            ...part,
            text: truncateToolOutput(part.text, remainingBytes, savedPath),
          });
          budgetExhausted = true;
          remainingBytes = 0;
        } else {
          processedParts.push(part);
          remainingBytes = Math.max(0, remainingBytes - partBytes - 1);
        }
      } else {
        processedParts.push(part);
      }
    }
    finalContent = processedParts;
  } else if (
    typeof finalContent === 'object' &&
    finalContent !== null &&
    'text' in finalContent &&
    typeof finalContent.text === 'string' &&
    Buffer.byteLength(finalContent.text, 'utf8') >
      MAX_STORED_TOOL_OUTPUT_BYTES
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
