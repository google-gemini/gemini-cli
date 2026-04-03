/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextManagementConfig {
  enabled: boolean;

  /** The global orchestration budget */
  budget: {
    /** The absolute maximum tokens before the context manager triggers */
    maxTokens: number;
    /** The target token count to reduce to when triggered */
    retainedTokens: number;
    /** The number of recent Episodes to always protect from degradation (default: 1) */
    protectedEpisodes: number;
    /** Should we protect Episode 0 (the System Prompt/Architectural Initialization)? */
    protectSystemEpisode: boolean;
    /** If true, the system only evicts exactly enough tokens to stay under maxTokens, ignoring retainedTokens. (default: false) */
    incrementalGc?: boolean;
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
