/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';

export type IrNodeType =
  // Organic Concrete Nodes
  | 'USER_PROMPT'
  | 'SYSTEM_EVENT'
  | 'AGENT_THOUGHT'
  | 'TOOL_EXECUTION'
  | 'AGENT_YIELD'

  // Synthetic Concrete Nodes
  | 'SNAPSHOT'
  | 'ROLLING_SUMMARY'
  | 'MASKED_TOOL'

  // Logical Nodes
  | 'TASK'
  | 'EPISODE';

/** Base interface for all nodes in the Episodic IR */
export interface IrNode {
  readonly id: string;
  readonly type: IrNodeType;
}

/**
 * Concrete Nodes: The atomic, renderable pieces of data.
 * These are the actual "planks" of the Ship of Theseus.
 */
export interface BaseConcreteNode extends IrNode {
  /** The ID of the Logical Node (e.g., Episode) that structurally owns this node */
  readonly logicalParentId?: string;

  /** If this node replaced a single node 1:1 (e.g., masking), this points to the original */
  readonly replacesId?: string;

  /** If this node is a synthetic summary of N nodes, this points to the original IDs */
  readonly abstractsIds?: readonly string[];
}

/**
 * Semantic Parts for User Prompts
 */
export type SemanticPart =
  | {
      readonly type: 'text';
      readonly text: string;
    }
  | {
      readonly type: 'inline_data';
      readonly mimeType: string;
      readonly data: string;
    }
  | {
      readonly type: 'file_data';
      readonly mimeType: string;
      readonly fileUri: string;
    }
  | {
      readonly type: 'raw_part';
      readonly part: Part;
    };

/**
 * Trigger Nodes
 * Events that wake the agent up and initiate an Episode.
 */
export interface UserPrompt extends BaseConcreteNode {
  readonly type: 'USER_PROMPT';
  readonly semanticParts: readonly SemanticPart[];
}

export interface SystemEvent extends BaseConcreteNode {
  readonly type: 'SYSTEM_EVENT';
  readonly name: string;
  readonly payload: Record<string, unknown>;
}

export type EpisodeTrigger = UserPrompt | SystemEvent;

/**
 * Step Nodes
 * The internal autonomous actions taken by the agent during its loop.
 */
export interface AgentThought extends BaseConcreteNode {
  readonly type: 'AGENT_THOUGHT';
  readonly text: string;
}

export interface ToolExecution extends BaseConcreteNode {
  readonly type: 'TOOL_EXECUTION';
  readonly toolName: string;
  readonly intent: Record<string, unknown>;
  readonly observation: string | Record<string, unknown>;
  readonly tokens: {
    readonly intent: number;
    readonly observation: number;
  };
}

export interface MaskedTool extends BaseConcreteNode {
  readonly type: 'MASKED_TOOL';
  readonly toolName: string;
  readonly intent?: Record<string, unknown>;
  readonly observation?: string | Record<string, unknown>;
  readonly tokens: {
    readonly intent: number;
    readonly observation: number;
  };
}

export type EpisodeStep = AgentThought | ToolExecution | MaskedTool;

/**
 * Resolution Node
 * The final message where the agent yields control back to the user.
 */
export interface AgentYield extends BaseConcreteNode {
  readonly type: 'AGENT_YIELD';
  readonly text: string;
}

/**
 * Synthetic Leaf Interfaces
 * Processors that generate summaries emit explicit synthetic nodes.
 */
export interface Snapshot extends BaseConcreteNode {
  readonly type: 'SNAPSHOT';
  readonly timestamp: number;
  readonly text: string;
}

export interface RollingSummary extends BaseConcreteNode {
  readonly type: 'ROLLING_SUMMARY';
  readonly timestamp: number;
  readonly text: string;
}

export type SyntheticLeaf = Snapshot | RollingSummary;

export type ConcreteNode =
  | UserPrompt
  | SystemEvent
  | AgentThought
  | ToolExecution
  | MaskedTool
  | AgentYield
  | Snapshot
  | RollingSummary;

/**
 * Logical Nodes
 * These define hierarchy and grouping. They do not directly render to Gemini.
 */
export interface Episode extends IrNode {
  readonly type: 'EPISODE';
  readonly timestamp: number;
  /** References to the Concrete Node IDs that conceptually belong to this Episode. */
  concreteNodes: readonly ConcreteNode[];
}

export interface Task extends IrNode {
  readonly type: 'TASK';
  readonly timestamp: number;
  readonly goal: string;
  readonly status: 'active' | 'completed' | 'failed';
  /** References to the Episode IDs that belong to this task */
  readonly episodeIds: readonly string[];
}

export type LogicalNode = Task | Episode;
