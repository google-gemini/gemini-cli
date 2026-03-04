/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The specific dimensions being measured by the evaluation pipeline.
 */
export enum MetricObjective {
  ALIGNMENT = 'alignment',
  BREVITY = 'brevity',
}

/**
 * Standardized result for any metric calculation.
 * Designed for consumption by the Genetic-Pareto (GEPA) multi-objective function.
 */
export interface MetricResult {
  /**
   * The numeric score calculated by the metric.
   * All metrics must provide a value where HIGHER is BETTER.
   */
  score: number;

  /**
   * The specific objective this result corresponds to.
   */
  objective: MetricObjective;

  /**
   * A human-readable (and optimizer-reflective) reason for the score.
   */
  reason: string;

  /**
   * Additional data points (e.g., char counts, matched negative IDs).
   */
  metadata?: Record<string, unknown>;
}
