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
import levenshtein from 'fast-levenshtein';
import type { ToolCallResponseInfo } from '../scheduler/types.js';
import type { Part } from '@google/genai';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from './constants.js';

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
