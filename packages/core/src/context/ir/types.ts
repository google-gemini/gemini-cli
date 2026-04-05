/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Audit Metadata
 * Tracks the lifecycle and transformations of a node or part within the IR.
 * This guarantees perfect reversibility and enables long-term memory offloading.
 */
export interface IrMetadata {
  /** The estimated number of tokens this entity originally consumed. */
  originalTokens: number;
  /** The current estimated number of tokens this entity consumes in its degraded state. */
  currentTokens: number;
  /** An audit trail of all transformations applied by ContextProcessors. */
  transformations: Array<{
    processorName: string;
    action:
      | 'MASKED'
      | 'TRUNCATED'
      | 'DEGRADED'
      | 'SUMMARIZED'
      | 'EVICTED'
      | 'SYNTHESIZED';
    timestamp: number;
    /** Pointer to where the original uncompressed payload was saved (if applicable) */
    diskPointer?: string;
  }>;
}

export type IrNodeType =
  | 'USER_PROMPT'
  | 'SYSTEM_EVENT'
  | 'AGENT_THOUGHT'
  | 'TOOL_EXECUTION'
  | 'AGENT_YIELD';

/** Base interface for all nodes in the Episodic IR */
export type VariantStatus = 'computing' | 'ready' | 'failed';

export interface BaseVariant {
  status: VariantStatus;
  recoveredTokens?: number;
  error?: string;
}

export interface SummaryVariant extends BaseVariant {
  type: 'summary';
  text: string;
}

export interface MaskedVariant extends BaseVariant {
  type: 'masked';
  text: string;
}

export interface SnapshotVariant extends BaseVariant {
  type: 'snapshot';
  episode: Episode;
  replacedEpisodeIds: string[];
}

export type Variant = SummaryVariant | MaskedVariant | SnapshotVariant;

/** Base interface for all nodes in the Episodic IR */
export interface IrNode {
  readonly id: string;
  readonly type: IrNodeType;
  metadata: IrMetadata;
  variants?: Record<string, Variant>;
}

/**
 * Semantic Parts for User Prompts
 * Ensures we can safely truncate text without deleting multi-modal parts (like images).
 */
export type SemanticPart =
  | {
      type: 'text';
      text: string;
      presentation?: { text: string; tokens: number };
    }
  | {
      type: 'inline_data';
      mimeType: string;
      data: string;
      presentation?: { text: string; tokens: number };
    }
  | {
      type: 'file_data';
      mimeType: string;
      fileUri: string;
      presentation?: { text: string; tokens: number };
    }
  | {
      type: 'raw_part';
      part: unknown;
      presentation?: { text: string; tokens: number };
    };

/**
 * Trigger Nodes
 * Events that wake the agent up and initiate an Episode.
 */
export interface UserPrompt extends IrNode {
  readonly type: 'USER_PROMPT';
  /** The semantic breakdown of the user's multi-modal input */
  semanticParts: SemanticPart[];
}

export interface SystemEvent extends IrNode {
  readonly type: 'SYSTEM_EVENT';
  name: string;
  payload: Record<string, unknown>;
}

export type EpisodeTrigger = UserPrompt | SystemEvent;

/**
 * Step Nodes
 * The internal autonomous actions taken by the agent during its loop.
 */
export interface AgentThought extends IrNode {
  readonly type: 'AGENT_THOUGHT';
  text: string;
  /** Overrides the rendered output for this thought */
  presentation?: {
    text: string;
    tokens: number;
  };
}

export interface ToolExecution extends IrNode {
  readonly type: 'TOOL_EXECUTION';
  /** The name of the tool invoked */
  toolName: string;

  /** The arguments passed to the tool (The 'FunctionCall') */
  intent: Record<string, unknown>;

  /** The result returned by the tool (The 'FunctionResponse') */
  observation: string | Record<string, unknown>;

  /** Granular token tracking for the different lifecycle phases of the tool */
  tokens: {
    intent: number;
    observation: number;
  };

  /**
   * The presentation layer. If defined, the IrMapper uses this instead of the
   * raw observation to build the functionResponse.
   * This preserves the immutable raw data for semantic queries while modifying the rendered output.
   */
  presentation?: {
    intent?: Record<string, unknown>;
    observation?: string | Record<string, unknown>;
    tokens: {
      intent: number;
      observation: number;
    };
  };
}

export type EpisodeStep = AgentThought | ToolExecution;

/**
 * Resolution Node
 * The final message where the agent yields control back to the user.
 */
export interface AgentYield extends IrNode {
  readonly type: 'AGENT_YIELD';
  text: string;
  presentation?: {
    text: string;
    tokens: number;
  };
}

/**
 * The Episode
 * A discrete, continuous run of the agent. Represents the full cycle from
 * taking control (Trigger) to returning control (Yield), encompassing all
 * internal reasoning and observations (Steps).
 */
export interface Episode {
  readonly id: string;
  /** When the episode began */
  readonly timestamp: number;
  variants?: Record<string, Variant>;

  /** The event that initiated this run */
  trigger: EpisodeTrigger;

  /** The sequence of autonomous actions and observations */
  steps: EpisodeStep[];

  /** The final handover back to the user (can be undefined if the episode was aborted/errored) */
  yield?: AgentYield;
}
