/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

/**
 * Estimates token count for parts synchronously using a heuristic.
 * - Text: character-based heuristic (ASCII vs CJK).
 * - Non-text (Tools, etc): JSON string length / 4.
 */
export function estimateTokenCountSync(parts: Part[]): number {
  let totalTokens = 0;
  for (const part of parts) {
    if (typeof part.text === 'string') {
      for (const char of part.text) {
        // Simple heuristic:
        // ASCII characters (0-127) are roughly 4 chars per token -> 0.25 tokens/char
        // Non-ASCII characters (including CJK) are often 1-2 tokens per char.
        // We use 1.3 as a conservative estimate for non-ASCII to avoid underestimation.
        if (char.codePointAt(0)! <= 127) {
          totalTokens += 0.25;
        } else {
          totalTokens += 1.3;
        }
      }
    } else {
      // For non-text parts (functionCall, functionResponse, executableCode, etc.),
      // we fallback to the JSON string length heuristic.
      // Note: This is an approximation.
      totalTokens += JSON.stringify(part).length / 4;
    }
  }
  return Math.floor(totalTokens);
}

/**
 * Calculates the token count of the request.
 * If the request contains only text or tools, it estimates the token count locally.
 * If the request contains media (images, files), it uses the countTokens API.
 */
export async function calculateRequestTokenCount(
  request: PartListUnion,
  contentGenerator: ContentGenerator,
  model: string,
): Promise<number> {
  const parts: Part[] = Array.isArray(request)
    ? request.map((p) => (typeof p === 'string' ? { text: p } : p))
    : typeof request === 'string'
      ? [{ text: request }]
      : [request];

  // Use countTokens API only for heavy media parts that are hard to estimate.
  const hasMedia = parts.some((p) => {
    const isMedia = 'inlineData' in p || 'fileData' in p;
    return isMedia;
  });

  if (hasMedia) {
    const response = await contentGenerator.countTokens({
      model,
      contents: [{ role: 'user', parts }],
    });
    return response.totalTokens ?? 0;
  }

  return estimateTokenCountSync(parts);
}
