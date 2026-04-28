/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';

/**
 * Basic Node Interface
 * Every element in the Context Graph is a Node.
 */
export interface Node {
  readonly id: string;
  readonly type: string;
}

/**
 * Concrete Nodes: The atomic, renderable pieces of data.
 * These are the actual "planks" of the Nodes of Theseus.
 *
 * Each ConcreteNode is now a 1:1 wrapper around a Gemini Part,
 * ensuring 100% fidelity during reconstruction.
 */
export interface BaseConcreteNode extends Node {
  readonly timestamp: number;
  /** The role of the turn this part belongs to */
  readonly role: 'user' | 'model';
  /** The original, high-fidelity Part object from the API */
  readonly payload: Part;

  /** The ID of the Logical Node (e.g., Episode) that structurally owns this node */
  readonly logicalParentId?: string;

  /** If this node replaced a single node 1:1 (e.g., masking), this points to the original */
  readonly replacesId?: string;

  /** If this node is a synthetic summary of N nodes, this points to the original IDs */
  readonly abstractsIds?: readonly string[];
}

/**
 * Trigger Nodes
 * Events that wake the agent up and initiate an Episode.
 */
export interface UserPrompt extends BaseConcreteNode {
  readonly type: 'USER_PROMPT';
  readonly role: 'user';
}

export interface SystemEvent extends BaseConcreteNode {
  readonly type: 'SYSTEM_EVENT';
  readonly name: string;
  readonly payload: Part; // System events are usually injected as user text parts
}

export type EpisodeTrigger = UserPrompt | SystemEvent;

/**
 * Step Nodes
 * The internal autonomous actions taken by the agent during its loop.
 */
export interface AgentThought extends BaseConcreteNode {
  readonly type: 'AGENT_THOUGHT';
  readonly role: 'model';
}

export interface ToolExecution extends BaseConcreteNode {
  readonly type: 'TOOL_EXECUTION';
}

export interface MaskedTool extends BaseConcreteNode {
  readonly type: 'MASKED_TOOL';
}

export type EpisodeStep = AgentThought | ToolExecution | MaskedTool;

/**
 * Resolution Node
 * The final message where the agent yields control back to the user.
 */
export interface AgentYield extends BaseConcreteNode {
  readonly type: 'AGENT_YIELD';
  readonly role: 'model';
}

/**
 * Synthetic Leaf Interfaces
 * Processors that generate summaries emit explicit synthetic nodes.
 */
export interface Snapshot extends BaseConcreteNode {
  readonly type: 'SNAPSHOT';
}

export interface RollingSummary extends BaseConcreteNode {
  readonly type: 'ROLLING_SUMMARY';
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
export interface Episode extends Node {
  readonly type: 'EPISODE';
  /** References to the Concrete Node IDs that conceptually belong to this Episode. */
  concreteNodes: readonly ConcreteNode[];
}

export interface Task extends Node {
  readonly type: 'TASK';
  readonly goal: string;
  readonly status: 'active' | 'completed' | 'failed';
  /** References to the Episode IDs that belong to this task */
  readonly episodeIds: readonly string[];
}

export type LogicalNode = Task | Episode;

export function isEpisode(node: Node): node is Episode {
  return node.type === 'EPISODE';
}

export function isTask(node: Node): node is Task {
  return node.type === 'TASK';
}

export function isAgentThought(node: Node): node is AgentThought {
  return node.type === 'AGENT_THOUGHT';
}

export function isAgentYield(node: Node): node is AgentYield {
  return node.type === 'AGENT_YIELD';
}

export function isToolExecution(node: Node): node is ToolExecution {
  return node.type === 'TOOL_EXECUTION';
}

export function isMaskedTool(node: Node): node is MaskedTool {
  return node.type === 'MASKED_TOOL';
}

export function isUserPrompt(node: Node): node is UserPrompt {
  return node.type === 'USER_PROMPT';
}

export function isSystemEvent(node: Node): node is SystemEvent {
  return node.type === 'SYSTEM_EVENT';
}

export function isSnapshot(node: Node): node is Snapshot {
  return node.type === 'SNAPSHOT';
}

export function isRollingSummary(node: Node): node is RollingSummary {
  return node.type === 'ROLLING_SUMMARY';
}
