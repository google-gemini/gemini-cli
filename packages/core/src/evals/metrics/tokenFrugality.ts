/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../utils/debugLogger.js';
import { DEFAULT_EVAL_CONFIG } from '../config.js';
import { MetricObjective, OptimizationDirection } from '../types.js';
import type { MetricResult } from '../types.js';

/**
 * Evaluates the frugality of a model's response by measuring total character count.
 * Focuses on reducing conversational noise ("chatter").
 */
export function evaluateTokenFrugality(
  prediction: { output_text?: string },
  config = DEFAULT_EVAL_CONFIG.objectives.frugality,
): MetricResult {
  const chatter = prediction.output_text ?? '';
  const chatterLength = chatter.length;

  debugLogger.debug(
    `[Eval:Frugality] Measuring output text length: ${chatterLength} chars.`,
  );

  // In Genetic-Pareto, the raw score (length) is the value to be MINIMIZED.
  // We provide the raw count as the score, and the direction tells the optimizer how to handle it.

  let reason = `Response contains ${chatterLength} characters of non-tool text.`;

  if (chatterLength > config.chattyThresholdChars) {
    reason += ` (Exceeds threshold of ${config.chattyThresholdChars})`;
  } else {
    reason += ' (Succinct response)';
  }

  return {
    score: chatterLength,
    objective: MetricObjective.FRUGALITY,
    direction: OptimizationDirection.MINIMIZE,
    reason,
    metadata: {
      charCount: chatterLength,
      threshold: config.chattyThresholdChars,
      isOverThreshold: chatterLength > config.chattyThresholdChars,
    },
  };
}
