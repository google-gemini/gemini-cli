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

// Maximum number of characters to process with the full character-by-character heuristic.
// Above this, we use a faster approximation to avoid performance bottlenecks.
const MAX_CHARS_FOR_FULL_HEURISTIC = 100_000;

// Maximum depth for recursive token estimation to prevent stack overflow from
// malicious or buggy nested structures. A depth of 3 is sufficient given
// standard multimodal responses are typically depth 1.
const MAX_RECURSION_DEPTH = 3;

/**
 * Heuristic estimation of tokens for a text string.
 */
function estimateTextTokens(text: string): number {
  if (text.length > MAX_CHARS_FOR_FULL_HEURISTIC) {
    return text.length / 4;
  }

  let tokens = 0;
  // Optimized loop: charCodeAt is faster than for...of on large strings
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) <= 127) {
      tokens += ASCII_TOKENS_PER_CHAR;
    } else {
      tokens += NON_ASCII_TOKENS_PER_CHAR;
    }
  }
  return tokens;
}

/**
 * Heuristic estimation for media parts (images, PDFs) using fixed safe estimates.
 */
function estimateMediaTokens(part: Part): number | undefined {
  const inlineData = 'inlineData' in part ? part.inlineData : undefined;
  const fileData = 'fileData' in part ? part.fileData : undefined;
  const mimeType = inlineData?.mimeType || fileData?.mimeType;

  if (mimeType?.startsWith('image/')) {
    // Images: 3,000 tokens (covers up to 4K resolution on Gemini 3)
    // See: https://ai.google.dev/gemini-api/docs/vision#token_counting
    return IMAGE_TOKEN_ESTIMATE;
  } else if (mimeType?.startsWith('application/pdf')) {
    // PDFs: 25,800 tokens (~100 pages at 258 tokens/page)
    // See: https://ai.google.dev/gemini-api/docs/document-processing
    return PDF_TOKEN_ESTIMATE;
  }
  return undefined;
}

/**
 * Heuristic estimation for tool responses, avoiding massive string copies
 * and accounting for nested Gemini 3 multimodal parts.
 */
function estimateFunctionResponseTokens(part: Part, depth: number): number {
  const fr = part.functionResponse;
  if (!fr) return 0;

  let totalTokens = (fr.name?.length ?? 0) / 4;
  const response = fr.response as unknown;

  if (typeof response === 'string') {
    totalTokens += response.length / 4;
  } else if (response !== undefined && response !== null) {
    // For objects, stringify only the payload, not the whole Part object.
    totalTokens += JSON.stringify(response).length / 4;
  }

  // Gemini 3: Handle nested multimodal parts recursively.
  const nestedParts = (fr as unknown as { parts?: Part[] }).parts;
  if (nestedParts && nestedParts.length > 0) {
    totalTokens += estimateTokenCountSync(nestedParts, depth + 1);
  }

  return totalTokens;
}

/**
 * Estimates token count for parts synchronously using a heuristic.
 * - Text: character-based heuristic (ASCII vs CJK) for small strings, length/4 for massive ones.
 * - Non-text (Tools, etc): JSON string length / 4.
 */
export function estimateTokenCountSync(
  parts: Part[],
  depth: number = 0,
): number {
  if (depth > MAX_RECURSION_DEPTH) {
    return 0;
  }

  let totalTokens = 0;
  for (const part of parts) {
    if (typeof part.text === 'string') {
      totalTokens += estimateTextTokens(part.text);
    } else if (part.functionResponse) {
      totalTokens += estimateFunctionResponseTokens(part, depth);
    } else {
      const mediaEstimate = estimateMediaTokens(part);
      if (mediaEstimate !== undefined) {
        totalTokens += mediaEstimate;
      } else {
        // Fallback for other non-text parts (e.g., functionCall).
        // Note: JSON.stringify(part) here is safe as these parts are typically small.
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
