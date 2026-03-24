/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../../../packages/core/src/utils/debugLogger.js';
import { DEFAULT_EVAL_CONFIG } from '../config.js';
import { MetricObjective } from '../types.js';
import type { MetricResult } from '../types.js';

/**
 * Evaluates the brevity of a model's response using a tiered 4-step word-count function.
 * Focuses on rewarding succinctness and providing a non-zero gradient for verbose models.
 */
export function evaluateBrevity(
  prediction: { output_text?: string },
  config = DEFAULT_EVAL_CONFIG.objectives.brevity,
): MetricResult {
  const chatter = (prediction.output_text ?? '').trim();

  // Simple word count: split by whitespace and filter out empty strings
  const wordCount = chatter === '' ? 0 : chatter.split(/\s+/).length;

  debugLogger.debug(
    `[Eval:Brevity] Measuring output text word count: ${wordCount} words.`,
  );

  let score: number;
  let reason: string;

  if (wordCount <= config.succinctThresholdWords) {
    score = config.succinctScore;
    reason = `Succinct: Response is within ${config.succinctThresholdWords} words.`;
  } else if (wordCount <= config.acceptableThresholdWords) {
    score = config.acceptableScore;
    reason = `Acceptable: Response is slightly verbose (${wordCount} words), exceeding ${config.succinctThresholdWords} words.`;
  } else if (wordCount <= config.verboseThresholdWords) {
    score = config.verboseScore;
    reason = `Verbose: Response contains ${wordCount} words, exceeding acceptable limit of ${config.acceptableThresholdWords} words.`;
  } else {
    score = config.heavyScore;
    reason = `Heavy: Response is excessively verbose (${wordCount} words).`;
  }

  return {
    score,
    objective: MetricObjective.BREVITY,
    reason,
    metadata: {
      wordCount,
      tier:
        score === 1.0
          ? 'succinct'
          : score === 0.7
            ? 'acceptable'
            : score === 0.4
              ? 'verbose'
              : 'heavy',
    },
  };
}
