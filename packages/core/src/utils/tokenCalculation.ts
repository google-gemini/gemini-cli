/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { debugLogger } from './debugLogger.js';

// Token estimation constants
// ASCII characters (0-127) are roughly 4 chars per token
const ASCII_TOKENS_PER_CHAR = 0.25;
// Non-ASCII characters (including CJK) are often 1-2 tokens per char.
// We use 1.3 as a conservative estimate to avoid underestimation.
const NON_ASCII_TOKENS_PER_CHAR = 1.3;
// Fixed token estimate for images
const IMAGE_TOKEN_ESTIMATE = 3000;
// Fixed token estimate for PDFs (~100 pages at 258 tokens/page)
// See: https://ai.google.dev/gemini-api/docs/document-processing
const PDF_TOKEN_ESTIMATE = 25800;

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
      // For images and PDFs, we use fixed safe estimates:
      // - Images: 3,000 tokens (covers up to 4K resolution on Gemini 3)
      // - PDFs: 25,800 tokens (~100 pages at 258 tokens/page)
      // See: https://ai.google.dev/gemini-api/docs/vision#token_counting
      // See: https://ai.google.dev/gemini-api/docs/document-processing
      const inlineData = 'inlineData' in part ? part.inlineData : undefined;
      const fileData = 'fileData' in part ? part.fileData : undefined;
      const mimeType = inlineData?.mimeType || fileData?.mimeType;

      if (mimeType?.startsWith('image/')) {
        totalTokens += IMAGE_TOKEN_ESTIMATE;
      } else if (mimeType?.startsWith('application/pdf')) {
        totalTokens += PDF_TOKEN_ESTIMATE;
      } else {
        // For other non-text parts (functionCall, functionResponse, etc.),
        // we fallback to the JSON string length heuristic.
        // Note: This is an approximation.
        totalTokens += JSON.stringify(part).length / 4;
      }
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
    try {
      const response = await contentGenerator.countTokens({
        model,
        contents: [{ role: 'user', parts }],
      });
      return response.totalTokens ?? 0;
    } catch (error) {
      // Fallback to local estimation if the API call fails
      debugLogger.debug('countTokens API failed:', error);
      return estimateTokenCountSync(parts);
    }
  }

  return estimateTokenCountSync(parts);
}
