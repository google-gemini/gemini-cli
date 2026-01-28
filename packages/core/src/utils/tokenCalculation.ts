/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { isGemini3Model } from '../config/models.js';
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

/**
 * Estimates token count for parts synchronously using a heuristic.
 * - Text: character-based heuristic (ASCII vs CJK) for small strings, length/4 for massive ones.
 * - Non-text (Tools, etc): JSON string length / 4.
 */
export function estimateTokenCountSync(parts: Part[]): number {
  let totalTokens = 0;
  for (const part of parts) {
    if (typeof part.text === 'string') {
      if (part.text.length > MAX_CHARS_FOR_FULL_HEURISTIC) {
        totalTokens += part.text.length / 4;
      } else {
        for (const char of part.text) {
          if (char.codePointAt(0)! <= 127) {
            totalTokens += ASCII_TOKENS_PER_CHAR;
          } else {
            totalTokens += NON_ASCII_TOKENS_PER_CHAR;
          }
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

      if (inlineData || fileData) {
        const mimeType = inlineData?.mimeType || fileData?.mimeType;
        if (mimeType?.startsWith('image/') || mimeType?.startsWith('application/pdf')) {
          totalTokens += estimateMediaTokenCount(mimeType);
        } else {
          totalTokens += JSON.stringify(part).length / 4;
        }
      } else if ('functionResponse' in part && part.functionResponse) {
        // Iterate through function responses to check for nested media content
        // This is critical for Gemini 3 tools which may return heavy media payload
        // that shouldn't be stringified as JSON.
        
        // Check for hidden 'parts' property (Gemini 3 specific structure for media compatibility)
        const frParts = (part.functionResponse as any).parts;
        let handledMediaByKey = false;
        if (frParts && Array.isArray(frParts)) {
           totalTokens += estimateTokenCountSync(frParts);
           handledMediaByKey = true;
        }

        const response = part.functionResponse.response as Record<string, any>;
        if (response && typeof response === 'object') {
          // Check for standard Gemini multimodal structure in response
          // or flattened structure if tools return it that way
          if (response['content'] && Array.isArray(response['content'])) {
            // Recurse into content parts
            totalTokens += estimateTokenCountSync(response['content']);
          } else if (
            response['content'] &&
            typeof response['content'] === 'object'
          ) {
            // Handle single part content
            const content = response['content'] as Part;
            if (content.inlineData || content.fileData) {
              totalTokens += estimateTokenCountSync([content]);
            } else {
               if (!handledMediaByKey) {
                  totalTokens += JSON.stringify(part).length / 4;
               } else {
                  // Only count the response JSON overhead, not the heavy parts
                  totalTokens += JSON.stringify(response).length / 4;
               }
            }
          } else if (
            response['llmContent'] &&
            typeof response['llmContent'] === 'object'
          ) {
            // Support for 'llmContent' used by tools like readFile
            if (Array.isArray(response['llmContent'])) {
              totalTokens += estimateTokenCountSync(response['llmContent']);
            } else {
              const content = response['llmContent'] as Part;
              if (content.inlineData || content.fileData) {
                totalTokens += estimateTokenCountSync([content]);
              } else {
                if (!handledMediaByKey) {
                   totalTokens += JSON.stringify(part).length / 4;
                } else {
                   totalTokens += JSON.stringify(response).length / 4;
                }
              }
            }
          } else if (response['inlineData']) {
            // Handle direct inlineData in response (non-standard but possible)
            const mimeType = response['inlineData'].mimeType;
            if (
              mimeType?.startsWith('image/') ||
              mimeType?.startsWith('application/pdf')
            ) {
              totalTokens += estimateMediaTokenCount(mimeType);
            } else {
               if (!handledMediaByKey) {
                  totalTokens += JSON.stringify(part).length / 4;
               } else {
                  totalTokens += JSON.stringify(response).length / 4;
               }
            }
          } else {
            // Fallback for text-only tool responses
            if (!handledMediaByKey) {
               totalTokens += JSON.stringify(part).length / 4;
            } else {
               totalTokens += JSON.stringify(response).length / 4;
            }
          }
        } else {
           if (!handledMediaByKey) {
              totalTokens += JSON.stringify(part).length / 4;
           } else {
               // If response is missing or not an object, just add small constant
               totalTokens += 10;
           }
        }
      } else {
        // For other non-text parts (functionCall, etc.) fallback to JSON length
        totalTokens += JSON.stringify(part).length / 4;
      }
    }
  }
  return Math.floor(totalTokens);
}

function estimateMediaTokenCount(mimeType: string): number {
  if (mimeType.startsWith('image/')) {
    return IMAGE_TOKEN_ESTIMATE;
  }
  if (mimeType.startsWith('application/pdf')) {
    return PDF_TOKEN_ESTIMATE;
  }
  return 0;
}

/**
 * Checks recursively if a part or list of parts contains media (inlineData or fileData).
 * This is important for tool responses that might nest media deep within their results.
 */
function hasRecursiveMedia(parts: Part[]): boolean {
  return parts.some((p) => {
    if ('inlineData' in p || 'fileData' in p) return true;
    if ('functionResponse' in p && p.functionResponse) {
      // Check for hidden 'parts' property used by Gemini 3
      // This is where convertToFunctionResponse attaches media
      const frParts = (p.functionResponse as any).parts;
      if (frParts && Array.isArray(frParts)) {
        if (hasRecursiveMedia(frParts)) return true;
      }

      const resp = p.functionResponse.response as Record<string, any>;
      if (!resp || typeof resp !== 'object') return false;

      // Check standard 'content' array
      if (Array.isArray(resp['content'])) {
        return hasRecursiveMedia(resp['content']);
      }
      // Check Standard 'content' single part
      if (resp['content'] && typeof resp['content'] === 'object') {
        const content = resp['content'] as Part;
        if ('inlineData' in content || 'fileData' in content) return true;
      }
      // Check 'llmContent' (used by some tools like readFile)
      if (resp['llmContent'] && typeof resp['llmContent'] === 'object') {
        const llmContent = resp['llmContent'] as Part;
        if ('inlineData' in llmContent || 'fileData' in llmContent) return true;
        if (Array.isArray(resp['llmContent'])) {
          return hasRecursiveMedia(resp['llmContent']);
        }
      }
      // Check direct nested inlineData
      if (resp['inlineData']) return true;
    }
    return false;
  });
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
  // We use recursive check to find nested media in tool responses.
  const hasMedia = hasRecursiveMedia(parts);

  // For Gemini 3 models, the countTokens API returns inflated values for base64 media
  // (counting characters instead of image tokens). We skip the API for these models
  // and use our local estimation (fixed values) instead.
  // See: https://github.com/google/gemini-cli/issues/15672
  if (hasMedia && !isGemini3Model(model)) {
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
