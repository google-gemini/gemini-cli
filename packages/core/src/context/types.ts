/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextManagementConfig {
  enabled: boolean;

  /** The global orchestration budget */
  budget: {
    /** The absolute maximum tokens before the context manager triggers the Synchronous Pressure Barrier */
    maxTokens: number;
    /** The target token count to aggressively drop to using asynchronous "Ship of Theseus" background GC */
    retainedTokens: number;
    /** The number of recent Episodes to always protect from degradation (default: 1) */
    protectedEpisodes: number;
    /** Should we protect Episode 0 (the System Prompt/Architectural Initialization)? */
    protectSystemEpisode: boolean;
    
    /** 
     * The strategy to use when maxTokens is exceeded.
     * - 'truncate': Drop oldest episodes until under limit (Instant, data loss)
     * - 'compress': Block request, perform N-to-1 Snapshot generation, then proceed (Slow, no data loss)
     */
    maxPressureStrategy: 'truncate' | 'compress' | 'rollingSummarizer';
    gcTarget: 'incremental' | 'freeNTokens' | 'max';
    freeTokensTarget?: number;
  };

  /** Specific hyperparameters for degrading the context when over budget */
  strategies: {
    historySquashing: {
      /** The maximum allowable tokens for a text node (Prompt/Thought/Yield) before it gets proportionally truncated */
      maxTokensPerNode: number;
    };
    toolMasking: {
      /** The threshold (in tokens) at which a deep JSON string leaf is masked */
      stringLengthThresholdTokens: number;
    };
    semanticCompression: {
      /** The threshold (in tokens) at which a text node is sent to the LLM for summarization */
      nodeThresholdTokens: number;
      /** The model to use for generating the semantic summary */
      compressionModel: string;
    };
  };
}
