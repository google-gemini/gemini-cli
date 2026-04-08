/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode, Snapshot, RollingSummary } from './ir/types.js';

export type InboxMessage = 
  | { type: 'SNAPSHOT_READY'; snapshot: Snapshot; abstractsIds: string[] }
  | { type: 'BACKGROUND_SUMMARY'; summary: RollingSummary; targetId: string };

export interface ContextInbox {
  dispatch(message: InboxMessage): void;
  peek<T extends InboxMessage['type']>(type: T): Extract<InboxMessage, { type: T }> | undefined;
}

export interface ContextWorkingBuffer {
  /** The current active (projected) flat list of ConcreteNodes. */
  readonly nodes: readonly ConcreteNode[];
  
  /** Retrieves the historical, pristine version of a node (before any masks/summaries). */
  getPristineNode(id: string): ConcreteNode | undefined;
  
  /** Retrieves the full audit lineage of a specific node ID. */
  getLineage(id: string): readonly ConcreteNode[];
}

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
export interface ProcessArgs {
  /** The rich buffer containing current nodes and their history. */
  readonly buffer: ContextWorkingBuffer;
  
  /** 
   * The unprotected, mutable subset of nodes targeted by this trigger.
   * The Orchestrator strictly filters out ANY protected nodes (like active tasks) before calling.
   * Processors can assume all targets passed here are legally theirs to mutate or drop.
   */
  readonly targets: readonly ConcreteNode[];
  
  /** The token budget and accounting state. */
  readonly state: ContextAccountingState;
  
  /** Type-safe messaging system for async/sync coordination. */
  readonly inbox: ContextInbox;
}

/**
 * Interface for all context degradation strategies.
 * Processors are pure functional map/filter operations over the targets.
 */
export interface ContextProcessor {
  /** Unique ID for registry mapping. */
  readonly id: string;
  /** Unique name for telemetry and logging. */
  readonly name: string;

  /** 
   * A pure function. Returns the new state of the `targets`. 
   * If an ID from `targets` is missing in the return array, the Orchestrator deletes it.
   * If a new synthetic node is in the return array, the Orchestrator inserts it.
   * The Orchestrator automatically appends audit `IrMetadata` to any changes.
   */
  process(args: ProcessArgs): Promise<readonly ConcreteNode[]>;
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