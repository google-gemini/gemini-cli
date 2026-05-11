/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor, AsyncContextProcessor } from '../pipeline.js';

export type PipelineTrigger =
  | 'new_message'
  | 'retained_exceeded'
  | 'gc_backstop'
  | 'nodes_added'
  | 'nodes_aged_out'
  | { type: 'timer'; intervalMs: number };

export interface PipelineDef {
  name: string;
  triggers: PipelineTrigger[];
  processors: ContextProcessor[];
}

export interface AsyncPipelineDef {
  name: string;
  triggers: PipelineTrigger[];
  processors: AsyncContextProcessor[];
}

export interface ContextBudget {
  retainedTokens: number;
  maxTokens: number;
  /**
   * Only trigger background consolidation (snapshots) when at least this many
   * tokens have aged out. Prevents "turn-by-turn" utility model churn.
   */
  coalescingThresholdTokens?: number;
}

/**
 * The Data-Driven Schema for the Context Manager.
 */
export interface ContextManagementConfig {
  /** Defines the token ceilings and limits for the pipeline. */
  budget: ContextBudget;

  /**
   * Dynamic hyperparameter overrides for individual ContextProcessors and AsyncProcessors.
   * Keys are named identifiers (e.g. "gentleTruncation").
   */
  processorOptions?: Record<string, { type: string; options: unknown }>;
}
