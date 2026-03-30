/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import {
  estimateTokenCountSync,
  ASCII_TOKENS_PER_CHAR,
  NON_ASCII_TOKENS_PER_CHAR,
} from './tokenCalculation.js';

export const MIN_TARGET_TOKENS = 10;
export const MIN_CHARS_FOR_TRUNCATION = 100;
export const TEXT_TRUNCATION_PREFIX =
  '[Message Normalized: Exceeded size limit]';
export const TOOL_TRUNCATION_PREFIX =
  '[Message Normalized: Tool output exceeded size limit]';

/**
 * Estimates the character limit for a target token count, accounting for ASCII vs Non-ASCII.
 * Uses a weighted average based on the provided text to decide how many characters
 * fit into the target token budget.
 */
export function estimateCharsFromTokens(
  text: string,
  targetTokens: number,
): number {
  if (text.length === 0) return 0;

  // Count ASCII vs Non-ASCII in a sample of the text.
  let asciiCount = 0;
  const sampleLen = Math.min(text.length, 1000);
  for (let i = 0; i < sampleLen; i++) {
    if (text.charCodeAt(i) <= 127) {
      asciiCount++;
    }
  }

  const asciiRatio = asciiCount / sampleLen;
  // Weighted tokens per character:
  const avgTokensPerChar =
    asciiRatio * ASCII_TOKENS_PER_CHAR +
    (1 - asciiRatio) * NON_ASCII_TOKENS_PER_CHAR;

  // Characters = Tokens / (Tokens per Character)
  return Math.floor(targetTokens / avgTokensPerChar);
}

/**
 * Truncates a string to a target length, keeping a proportional amount of the head and tail,
 * and prepending a prefix.
 */
export function truncateProportionally(
  str: string,
  targetChars: number,
  prefix: string,
  headRatio: number = 0.2,
): string {
  if (str.length <= targetChars) return str;

  const ellipsis = '\n...\n';
  const overhead = prefix.length + ellipsis.length + 1; // +1 for the newline after prefix
  const availableChars = Math.max(0, targetChars - overhead);

  if (availableChars <= 0) {
    return prefix; // Safe fallback if target is extremely small
  }

  const headChars = Math.floor(availableChars * headRatio);
  const tailChars = availableChars - headChars;

  return `${prefix}\n${str.substring(0, headChars)}${ellipsis}${str.substring(str.length - tailChars)}`;
}

/**
 * Safely normalizes a function response by truncating large string values
 * within the response object while maintaining its JSON structure.
 */
export function normalizeFunctionResponse(
  part: Part,
  ratio: number,
  headRatio: number = 0.2,
  savedPath?: string,
  intentSummary?: string,
): Part {
  const fr = part.functionResponse;
  if (!fr || !fr.response) return part;

  const responseObj = fr.response;
  if (typeof responseObj !== 'object' || responseObj === null) return part;

  let hasChanges = false;
  const newResponse: Record<string, unknown> = {};

  // For function responses, we truncate individual string values that are large.
  // This preserves the schema keys (stdout, stderr, etc).
  for (const [key, value] of Object.entries(responseObj)) {
    if (typeof value === 'string' && value.length > MIN_CHARS_FOR_TRUNCATION) {
      const valueTokens = estimateTokenCountSync([{ text: value }]);
      const targetValueTokens = Math.max(
        MIN_TARGET_TOKENS,
        Math.floor(valueTokens * ratio),
      );
      const targetChars = estimateCharsFromTokens(value, targetValueTokens);

      if (value.length > targetChars) {
        let truncated = truncateProportionally(
          value,
          targetChars,
          TOOL_TRUNCATION_PREFIX,
          headRatio,
        );
        if (savedPath) {
          truncated += `\n\nFull output saved to: ${savedPath}`;
        }
        if (intentSummary) {
          truncated += intentSummary;
        }
        newResponse[key] = truncated;
        hasChanges = true;
      } else {
        newResponse[key] = value;
      }
    } else {
      newResponse[key] = value;
    }
  }

  if (!hasChanges) return part;

  return {
    functionResponse: {
      // This spread should be safe as we mostly care about the function
      // response properties.
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...fr,
      response: newResponse,
    },
  };
}
