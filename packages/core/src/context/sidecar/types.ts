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

/**
 * The Data-Driven Schema for the Context Manager.
 */
export interface SidecarConfig {
  /** Defines the token ceilings and limits for the pipeline. */
  budget: {
    retainedTokens: number;
    maxTokens: number;
  };
  /** 
   * Dynamic hyperparameter overrides for individual ContextProcessors and Workers. 
   * Keys are named identifiers (e.g. "gentleTruncation").
   */
  processorOptions?: Record<string, { type: string; options: unknown }>;
}
