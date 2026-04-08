/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { estimateTokenCountSync as baseEstimate } from '../../utils/tokenCalculation.js';
import type { ConcreteNode } from '../ir/types.js';

/**
 * The flat token cost assigned to a single multi-modal asset (like an image tile)
 * by the Gemini API. We use this as a baseline heuristic for inlineData/fileData.
 */


export class ContextTokenCalculator {
  constructor(private readonly charsPerToken: number) {}

  /**
   * Fast, simple heuristic estimation for a raw string.
   */
  estimateTokensForString(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Fast, simple heuristic conversion from tokens to expected character length.
   * Useful for calculating truncation thresholds.
   */
  tokensToChars(tokens: number): number {
    return tokens * this.charsPerToken;
  }

  /**
   * Calculates the total token count for a flat array of ConcreteNodes (The Ship).
   * This is fast because it relies on pre-computed metadata where available.
   */
  calculateConcreteListTokens(ship: ReadonlyArray<ConcreteNode>): number {
    let tokens = 0;
    for (const node of ship) {
       tokens += node.metadata.currentTokens;
    }
    return tokens;
  }

  /**
   * Slower, precise estimation for a Gemini Content/Part graph.
   * Deeply inspects the nested structure and uses the base tokenization math.
   */
  estimateTokensForParts(parts: Part[], depth: number = 0): number {
    let totalTokens = 0;
    for (const part of parts) {
      if (typeof part.text === 'string') {
        totalTokens += Math.ceil(part.text.length / this.charsPerToken);
      } else if (part.inlineData !== undefined || part.fileData !== undefined) {
        totalTokens += 258;
      } else {
        totalTokens += Math.ceil(
          JSON.stringify(part).length / this.charsPerToken,
        );
      }
    }
    // Also include structural overhead
    return totalTokens + baseEstimate(parts, depth);
  }
}
