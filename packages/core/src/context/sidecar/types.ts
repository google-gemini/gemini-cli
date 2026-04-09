/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessorFn } from '../pipeline.js';

export type PipelineTrigger =
  | 'new_message'
  | 'retained_exceeded'
  | 'gc_backstop'
  | { type: 'timer'; intervalMs: number };

export interface PipelineDef {
  name: string;
  triggers: PipelineTrigger[];
  processors: ContextProcessorFn[];
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
}
