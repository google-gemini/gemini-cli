/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

/**
 * Estimates token count for text parts synchronously using a heuristic.
 */
export function estimateTokenCountSync(parts: Part[]): number {
  let totalTokens = 0;
  for (const part of parts) {
    if (part.text) {
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
    }
  }
  return Math.floor(totalTokens);
}

/**
 * Calculates the token count of the request.
 * If the request contains only text, it estimates the token count locally.
 * If the request contains non-text parts (like images, tools), it uses the countTokens API.
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

  // Check if any part is missing text (implies it's a non-text part like image or tool call)
  const hasNonText = parts.some((p) => typeof p.text !== 'string');

  if (hasNonText) {
    const response = await contentGenerator.countTokens({
      model,
      contents: [{ role: 'user', parts }],
    });
    return response.totalTokens ?? 0;
  }

  return estimateTokenCountSync(parts);
}
