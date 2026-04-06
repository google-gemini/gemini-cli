/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { estimateTokenCountSync as baseEstimate } from '../../utils/tokenCalculation.js';
import type { Episode } from '../ir/types.js';

export function calculateEpisodeListTokens(episodes: Episode[]): number {
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

export function estimateContextTokenCountSync(
  parts: Part[],
  depth: number = 0,
  config?: { charsPerToken?: number },
): number {
  if (config?.charsPerToken !== undefined && config.charsPerToken !== 4) {
    let totalTokens = 0;
    for (const part of parts) {
      if (typeof part.text === 'string') {
        totalTokens += Math.ceil(part.text.length / config.charsPerToken);
      } else {
        totalTokens += Math.ceil(
          JSON.stringify(part).length / config.charsPerToken,
        );
      }
    }
    return totalTokens;
  }

  // The baseEstimate no longer accepts config because we forked it!
  return baseEstimate(parts, depth);
}
