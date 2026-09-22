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

/**
 * Truncates large tool execution output to stay within a maximum byte cap.
 * When the output exceeds the limit, it truncates the middle and appends a clear indicator:
 * "... [Tool output truncated: X bytes omitted to conserve memory] ..."
 *
 * @param output The raw tool output string.
 * @param maxBytes Maximum allowed bytes (defaults to MAX_STORED_TOOL_OUTPUT_BYTES = 64 KB).
 * @returns The output truncated to at most maxBytes.
 */
export function truncateToolOutput(
  output: string,
  maxBytes: number = MAX_STORED_TOOL_OUTPUT_BYTES,
): string {
  const totalBytes = Buffer.byteLength(output, 'utf8');
  if (totalBytes <= maxBytes) {
    return output;
  }

  // Reserve space for indicator:
  // e.g. "\n... [Tool output truncated: 12345678 bytes omitted to conserve memory] ...\n"
  const sampleIndicator = `\n... [Tool output truncated: ${totalBytes} bytes omitted to conserve memory] ...\n`;
  const reservedBytes = Buffer.byteLength(sampleIndicator, 'utf8') + 8;
  const availableBytes = maxBytes - reservedBytes;

  if (availableBytes <= 0) {
    return `... [Tool output truncated: ${totalBytes} bytes omitted to conserve memory] ...`;
  }

  const headTargetBytes = Math.floor(availableBytes / 2);
  const tailTargetBytes = availableBytes - headTargetBytes;

  const buf = Buffer.from(output, 'utf8');
  let headSlice = buf.subarray(0, headTargetBytes).toString('utf8');
  while (Buffer.byteLength(headSlice, 'utf8') > headTargetBytes) {
    headSlice = headSlice.slice(0, -1);
  }

  let tailSlice = buf.subarray(buf.length - tailTargetBytes).toString('utf8');
  while (Buffer.byteLength(tailSlice, 'utf8') > tailTargetBytes) {
    tailSlice = tailSlice.slice(1);
  }

  const retainedBytes =
    Buffer.byteLength(headSlice, 'utf8') + Buffer.byteLength(tailSlice, 'utf8');
  const omittedBytes = totalBytes - retainedBytes;
  const indicator = `\n... [Tool output truncated: ${omittedBytes} bytes omitted to conserve memory] ...\n`;

  return headSlice + indicator + tailSlice;
}

/**
 * Truncates large tool response fields in a Gemini Part to keep stored chat history bounded.
 */
export function truncateFunctionResponsePart(
  part: Part,
  maxBytes: number = MAX_STORED_TOOL_OUTPUT_BYTES,
): Part {
  if (part.text && Buffer.byteLength(part.text, 'utf8') > maxBytes) {
    return {
      ...part,
      text: truncateToolOutput(part.text, maxBytes),
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
          response: { output: truncateToolOutput(resp, maxBytes) },
        },
      };
    }
    return part;
  }

  if (typeof resp === 'object' && resp !== null) {
    let modified = false;
    const newResp: Record<string, unknown> = { ...resp };
    for (const [key, value] of Object.entries(newResp)) {
      if (
        typeof value === 'string' &&
        Buffer.byteLength(value, 'utf8') > maxBytes
      ) {
        newResp[key] = truncateToolOutput(value, maxBytes);
        modified = true;
      }
    }
    if (modified) {
      return {
        ...part,
        functionResponse: {
          // eslint-disable-next-line @typescript-eslint/no-misused-spread
          ...part.functionResponse,
          response: newResp,
        },
      };
    }
  }

  return part;
}
