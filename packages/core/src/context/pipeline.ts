/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EpisodeEditor } from './ir/episodeEditor.js';

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

  /**
   * If this pipeline was triggered by a specific event (e.g., a new turn),
   * this contains the specific Node IDs (Episodes, Steps, or Triggers) that should be evaluated.
   * If undefined, the processor may evaluate the entire graph.
   */
  readonly targetNodeIds?: Set<string>;
}

/**
 * Interface for all context degradation strategies.
 */
export interface ContextProcessor {
  /** Unique name for telemetry and logging. */
  readonly name: string;

  /**
   * Processes the episodic history payload via the provided EpisodeEditor, based on the current accounting state.
   * Processors should safely mutate or replace episodes using the editor's API.
   */
  process(editor: EpisodeEditor, state: ContextAccountingState): Promise<void>;
}

/**
 * Standardized configuration options for processors that act as a GC Backstop.
 * Defines exactly how much of the targeted (degraded/aged-out) history should be cleared.
 */
export interface BackstopTargetOptions {
  /**
   * - 'incremental': Remove just enough to get under the threshold (maxTokens or retainedTokens).
   * - 'freeNTokens': Remove enough to free an explicit number of tokens (defined in freeTokensTarget).
   * - 'max': Remove/Summarize all explicitly targeted nodes (everything that aged out).
   */
  target?: 'incremental' | 'freeNTokens' | 'max';
  /** If target is 'freeNTokens', this is the amount of tokens to clear. */
  freeTokensTarget?: number;
}
