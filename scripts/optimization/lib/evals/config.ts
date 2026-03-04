/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration for the Tool Alignment objective (The Accuracy Dimension).
 */
export interface AlignmentConfig {
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
 * Configuration for the Brevity objective (The Density Dimension).
 * Uses a word-count step-function to provide high-contrast signal for GEPA.
 */
export interface BrevityConfig {
  /**
   * Importance of brevity relative to accuracy.
   */
  weight: number;

  /**
   * TIER 1: Response is perfectly succinct (e.g., <= 10 words).
   */
  succinctThresholdWords: number;
  succinctScore: number; // 1.0

  /**
   * TIER 2: Response is acceptable but slightly verbose (e.g., <= 25 words).
   */
  acceptableThresholdWords: number;
  acceptableScore: number; // 0.7

  /**
   * TIER 3: Response is verbose (e.g., <= 50 words).
   */
  verboseThresholdWords: number;
  verboseScore: number; // 0.4

  /**
   * TIER 4: Response is very heavy (e.g., > 50 words).
   */
  heavyScore: number; // 0.1
}

/**
 * Global evaluation configuration for multi-objective optimization.
 */
export interface EvalConfig {
  objectives: {
    alignment: AlignmentConfig;
    brevity: BrevityConfig;
  };
}

/**
 * Default weights and thresholds for the Genetic-Pareto (GEPA) engine.
 * These constants drive the 'Selection Pressure' that evolves the prompt.
 * GEPA always MAXIMIZES, so higher scores represent better performance.
 */
export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  objectives: {
    alignment: {
      weight: 1.0, // PRIMARY: Accuracy cannot be sacrificed.
      hardFailureScore: 0.0,
      invalidResponseScore: 0.1,
      toolNameMatchOnlyScore: 0.4,
      functionalSuccessScore: 1.0,
    },
    brevity: {
      weight: 0.6, // SECONDARY: Reward brevity once accuracy is high.
      succinctThresholdWords: 10,
      succinctScore: 1.0,
      acceptableThresholdWords: 25,
      acceptableScore: 0.7,
      verboseThresholdWords: 50,
      verboseScore: 0.4,
      heavyScore: 0.1, // Never hard-zero brevity to allow gradient improvement.
    },
  },
};
