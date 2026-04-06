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
  pipelines: {
    /** 
     * Eagerly executes in the background when the 'retainedTokens' boundary is crossed.
     * Contains AsyncContextWorkers (e.g. StateSnapshotWorker).
     */
    eagerBackground: ProcessorConfig[];

    /**
     * Executes sequentially to protect the pristine outliers within the retained window.
     * Contains ContextProcessors (e.g. HistorySquashingProcessor).
     */
    retainedProcessingGraph: ProcessorConfig[];

    /**
     * Executes sequentially to opportunistically degrade messages older than the retained window.
     * Contains ContextProcessors (e.g. ToolMaskingProcessor, SemanticCompressionProcessor).
     */
    normalProcessingGraph: ProcessorConfig[];
  };
}
