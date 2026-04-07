/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode, IrMetadata } from './ir/types.js';

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
   * Set of Logical Node IDs (like Tasks or Episodes) that the orchestrator has deemed highly protected.
   * Processors should generally skip mutating Concrete Nodes that belong to these parents.
   */
  readonly protectedLogicalIds: ReadonlySet<string>;

  /**
   * True if currentTokens <= retainedTokens.
   */
  readonly isBudgetSatisfied: boolean;
}

/**
 * A declarative instruction from a processor on how to modify the Ship.
 * Applied sequentially by the Orchestrator (Reducer).
 */
export interface ContextPatch {
  /** The IDs of the Concrete Nodes to remove from the Ship. */
  readonly removedIds: ReadonlyArray<string>;
  
  /** 
   * The new synthetic Concrete Nodes (e.g., MaskedTool, Snapshot) to insert.
   * If omitted or empty, this patch acts as a pure deletion.
   */
  readonly insertedNodes?: ReadonlyArray<ConcreteNode>;

  /** The index at which to insert the new nodes. If omitted, they replace the first removedId. */
  readonly insertionIndex?: number;
  
  /** Audit metadata explaining who made this patch, when, and why. */
  readonly metadata: IrMetadata;
}

export interface ProcessArgs {
  /** The flat, sequential array of current renderable nodes (The Ship). */
  readonly ship: ReadonlyArray<ConcreteNode>;
  
  /** 
   * The specific subset of Concrete Node IDs that triggered this execution.
   * For 'new_message', these are the new nodes. For 'retained_exceeded', the aged-out nodes.
   */
  readonly triggerTargets: ReadonlySet<string>;
  
  /** The token budget and accounting state. */
  readonly state: ContextAccountingState;
  
  /** 
   * An escape hatch allowing the processor to query the original, uncompressed
   * state of a node from the Pristine Graph.
   */
  readonly getPristineNode: (id: string) => ConcreteNode | undefined;
}

/**
 * Interface for all context degradation strategies.
 * Processors are pure functions that return ContextPatches.
 */
export interface ContextProcessor {
  /** Unique ID for registry mapping. */
  readonly id: string;
  /** Unique name for telemetry and logging. */
  readonly name: string;

  /** Returns an array of declarative patches to apply to the Ship. */
  process(args: ProcessArgs): Promise<ContextPatch[]>;
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