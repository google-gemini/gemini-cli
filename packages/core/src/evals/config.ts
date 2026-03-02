/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OptimizationDirection } from './types.js';

/**
 * Configuration for the Tool Alignment objective (The Accuracy Dimension).
 */
export interface AlignmentConfig {
  /**
   * Whether to increase or decrease the alignment score.
   */
  direction: OptimizationDirection.MAXIMIZE;

  /**
   * The relative importance of accuracy vs other objectives in the Pareto frontier.
   */
  weight: number;

  /**
   * Strongest negative signal (0.0): used when model falls into a known shell trap.
   */
  hardFailureScore: number;

  /**
   * Neutral negative signal (0.1): used when model fails to produce a valid tool call.
   */
  invalidResponseScore: number;

  /**
   * Partial positive signal (0.4): model chose the right tool but hallucinated arguments.
   */
  toolNameMatchOnlyScore: number;

  /**
   * Maximum positive signal (1.0): model matched the golden signature perfectly.
   */
  functionalSuccessScore: number;
}

/**
 * Configuration for the Token Frugality objective (The Density Dimension).
 */
export interface FrugalityConfig {
  /**
   * Whether to increase or decrease the token count.
   */
  direction: OptimizationDirection.MINIMIZE;

  /**
   * Importance of brevity relative to accuracy.
   */
  weight: number;

  /**
   * The 'conversational budget' - max chars of non-tool text allowed before penalty.
   */
  chattyThresholdChars: number;

  /**
   * Amount subtracted from the functional score if the model is too verbose.
   */
  chattyPenalty: number;
}

/**
 * Global evaluation configuration for multi-objective optimization.
 */
export interface EvalConfig {
  objectives: {
    alignment: AlignmentConfig;
    frugality: FrugalityConfig;
  };
}

/**
 * Default weights and thresholds for the Genetic-Pareto (GEPA) engine.
 * These constants drive the 'Selection Pressure' that evolves the prompt.
 */
export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  objectives: {
    alignment: {
      direction: OptimizationDirection.MAXIMIZE,
      weight: 1.0, // PRIMARY: Accuracy cannot be sacrificed.
      hardFailureScore: 0.0,
      invalidResponseScore: 0.1,
      toolNameMatchOnlyScore: 0.4,
      functionalSuccessScore: 1.0,
    },
    frugality: {
      direction: OptimizationDirection.MINIMIZE,
      weight: 0.6, // SECONDARY: Reward brevity once accuracy is high.
      chattyThresholdChars: 30, // Budget for 'I have updated the file' etc.
      chattyPenalty: 0.2, // Penalty creates a 'Reward Gap' for concise models.
    },
  },
};
