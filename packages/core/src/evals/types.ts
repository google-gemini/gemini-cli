/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines whether an objective should be increased or decreased during optimization.
 */
export enum OptimizationDirection {
  MINIMIZE = 'minimize',
  MAXIMIZE = 'maximize',
}

/**
 * The specific dimensions being measured by the evaluation pipeline.
 */
export enum MetricObjective {
  ALIGNMENT = 'alignment',
  FRUGALITY = 'frugality',
}

/**
 * Standardized result for any metric calculation.
 * Designed for consumption by the Genetic-Pareto (GEPA) multi-objective function.
 */
export interface MetricResult {
  /**
   * The numeric score calculated by the metric.
   */
  score: number;

  /**
   * The specific objective this result corresponds to.
   */
  objective: MetricObjective;

  /**
   * Whether the goal is to increase or decrease this specific score.
   */
  direction: OptimizationDirection;

  /**
   * A human-readable (and optimizer-reflective) reason for the score.
   */
  reason: string;

  /**
   * Additional data points (e.g., char counts, matched negative IDs).
   */
  metadata?: Record<string, unknown>;
}
