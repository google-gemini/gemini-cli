/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { estimateTokenCountSync as baseEstimate } from '../../utils/tokenCalculation.js';
import type { Episode } from '../ir/types.js';

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
   * Calculates the total token count for a complete Episodic IR graph.
   * This is fast because it relies on pre-computed metadata where available.
   */
  calculateEpisodeListTokens(episodes: Episode[]): number {
    let tokens = 0;
    for (const ep of episodes) {
      if (ep.trigger) tokens += ep.trigger.metadata.currentTokens;
      for (const step of ep.steps) {
        tokens += step.metadata.currentTokens;
      }
      if (ep.yield) tokens += ep.yield.metadata.currentTokens;
    }
    return tokens;
  }

  /**
   * Slower, precise estimation for a Gemini Content/Part graph.
   * Deeply inspects the nested structure and uses the base tokenization math.
   */
  estimateTokensForParts(parts: Part[], depth: number = 0): number {
    if (this.charsPerToken !== 4) {
      let totalTokens = 0;
      for (const part of parts) {
        if (typeof part.text === 'string') {
          totalTokens += Math.ceil(part.text.length / this.charsPerToken);
        } else {
          totalTokens += Math.ceil(
            JSON.stringify(part).length / this.charsPerToken,
          );
        }
      }
      return totalTokens;
    }

    // The baseEstimate no longer accepts config because we forked it!
    return baseEstimate(parts, depth);
  }
}
