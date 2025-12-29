/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Text tokenizer for calculating text tokens
 * Uses character-based heuristics that are compatible with most LLM tokenizers
 */
export class TextTokenizer {
  // Token estimation constants
  // ASCII characters (0-127) are roughly 4 chars per token
  private static readonly ASCII_TOKENS_PER_CHAR = 0.25;
  // Non-ASCII characters (including CJK) are often 1-2 tokens per char.
  // We use 1.3 as a conservative estimate to avoid underestimation.
  private static readonly NON_ASCII_TOKENS_PER_CHAR = 1.3;

  constructor(_encodingName: string = 'cl100k_base') {
    // encodingName is kept for API compatibility but not used in this implementation
    // as we use character-based heuristics instead of tiktoken
  }

  /**
   * Calculate tokens for text content using character-based heuristics
   * This provides accurate estimates without external dependencies
   */
  async calculateTokens(text: string): Promise<number> {
    if (!text) return 0;

    let totalTokens = 0;
    for (const char of text) {
      if (char.codePointAt(0)! <= 127) {
        totalTokens += TextTokenizer.ASCII_TOKENS_PER_CHAR;
      } else {
        totalTokens += TextTokenizer.NON_ASCII_TOKENS_PER_CHAR;
      }
    }

    return Math.floor(totalTokens);
  }

  /**
   * Calculate tokens for multiple text strings
   */
  async calculateTokensBatch(texts: string[]): Promise<number[]> {
    const results: number[] = [];

    for (const text of texts) {
      results.push(await this.calculateTokens(text));
    }

    return results;
  }

  /**
   * Dispose of resources (no-op for this implementation)
   */
  dispose(): void {
    // No resources to dispose
  }
}
