/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { getDefaultTokenizer } from './request-tokenizer/index.js';

// Token estimation constants
// ASCII characters (0-127) are roughly 4 chars per token
const ASCII_TOKENS_PER_CHAR = 0.25;
// Non-ASCII characters (including CJK) are often 1-2 tokens per char.
// We use 1.3 as a conservative estimate to avoid underestimation.
const NON_ASCII_TOKENS_PER_CHAR = 1.3;

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
        if (char.codePointAt(0)! <= 127) {
          totalTokens += ASCII_TOKENS_PER_CHAR;
        } else {
          totalTokens += NON_ASCII_TOKENS_PER_CHAR;
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
 * Uses local tokenizer for accurate estimation of both text and media content.
 *
 * Key improvement: For images/PDFs, calculates tokens based on actual image
 * dimensions (28x28 pixels = 1 token) instead of base64 string length.
 * This fixes false "context window exceeded" warnings for large files.
 *
 * Example improvement:
 * - 10MB PDF: ~3.5M tokens (old) -> ~16,386 tokens (new)
 * - 1024x768 image: ~1M tokens (old) -> ~1,003 tokens (new)
 */
export async function calculateRequestTokenCount(
  request: PartListUnion,
  _contentGenerator: ContentGenerator,
  model: string,
): Promise<number> {
  const parts: Part[] = Array.isArray(request)
    ? request.map((p) => (typeof p === 'string' ? { text: p } : p))
    : typeof request === 'string'
      ? [{ text: request }]
      : [request];

  // Check if request contains media (images, files)
  const hasMedia = parts.some((p) => {
    const isMedia = 'inlineData' in p || 'fileData' in p;
    return isMedia;
  });

  if (hasMedia) {
    // Use local tokenizer for accurate media token calculation
    // This calculates image tokens based on dimensions, not base64 length
    try {
      const tokenizer = getDefaultTokenizer();
      const result = await tokenizer.calculateTokens({
        model,
        contents: [{ role: 'user', parts }],
      });
      return result.totalTokens;
    } catch (error) {
      console.warn('Failed to calculate tokens with local tokenizer:', error);
      // Fallback to sync estimation
      return estimateTokenCountSync(parts);
    }
  }

  return estimateTokenCountSync(parts);
}
