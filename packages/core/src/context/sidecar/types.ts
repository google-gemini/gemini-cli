/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Definition of a processor or worker to be instantiated in the graph.
 */
export interface ProcessorConfig {
  /** The registered ID of the processor (e.g. 'SemanticCompressionProcessor') */
  processorId: string;

  /** Dynamic, processor-specific hyperparameters */
  options: Record<string, unknown>;
}

export type PipelineTrigger =
  | 'on_turn'
  | 'post_turn'
  | 'budget_exceeded'
  | { type: 'timer'; intervalMs: number };

export interface PipelineDef {
  name: string;
  triggers: PipelineTrigger[];
  execution: 'blocking' | 'background';
  processors: ProcessorConfig[];
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

  /** Defines what happens when the pipeline fails to compress under 'maxTokens' */
  gcBackstop: {
    strategy: 'truncate' | 'compress' | 'rollingSummarizer';
    target: 'incremental' | 'freeNTokens' | 'max';
    freeTokensTarget?: number;
  };

  /** The execution graphs for context manipulation */
  pipelines: PipelineDef[];
}
