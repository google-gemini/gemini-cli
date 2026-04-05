/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode } from './ir/types.js';

/**
 * State object passed through the processing pipeline.
 * Contains global accounting logic and semantic protection rules.
 */
export interface ContextAccountingState {
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly retainedTokens: number;

  /** The exact number of tokens that need to be trimmed to reach the retainedTokens goal */
  readonly deficitTokens: number;

  /**
   * Set of Episode IDs that the orchestrator has deemed highly protected.
   * Processors should generally skip mutating these episodes unless doing proactive/required transforms.
   */
  readonly protectedEpisodeIds: Set<string>;

  /**
   * True if currentTokens <= retainedTokens.
   */
  readonly isBudgetSatisfied: boolean;
}

/**
 * Interface for all context degradation strategies.
 */
export interface ContextProcessor {
  /** Unique name for telemetry and logging. */
  readonly name: string;

  /**
   * Processes the episodic history payload based on the current accounting state.
   * Processors should return a new or mutated array of episodes.
   */
  process(
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]>;
}
