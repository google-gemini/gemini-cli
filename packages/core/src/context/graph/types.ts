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

export enum NodeType {
  USER_PROMPT = 'USER_PROMPT',
  SYSTEM_EVENT = 'SYSTEM_EVENT',
  AGENT_THOUGHT = 'AGENT_THOUGHT',
  TOOL_EXECUTION = 'TOOL_EXECUTION',
  MASKED_TOOL = 'MASKED_TOOL',
  AGENT_YIELD = 'AGENT_YIELD',
  SNAPSHOT = 'SNAPSHOT',
  ROLLING_SUMMARY = 'ROLLING_SUMMARY',
}

export interface Node {
  readonly id: string;
  readonly type: NodeType;
}

/**
 * Concrete Nodes: The atomic, renderable pieces of data.
 * These are the actual "planks" of the Nodes of Theseus.
 *
 * Each ConcreteNode is now a 1:1 wrapper around a Gemini Part,
 * ensuring 100% fidelity during reconstruction.
 */
export interface BaseConcreteNode extends Node {
  readonly type: NodeType;
  readonly timestamp: number;
  /** The role of the turn this part belongs to */
  readonly role: 'user' | 'model';
  /** The original, high-fidelity Part object from the API */
  readonly payload: Part;

  /** The ID of the specific turn in history this node belongs to. Unique per turn. */
  readonly turnId: string;

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
  readonly type: NodeType.USER_PROMPT;
  readonly role: 'user';
}

export interface SystemEvent extends BaseConcreteNode {
  readonly type: NodeType.SYSTEM_EVENT;
  readonly name: string;
  readonly payload: Part; // System events are usually injected as user text parts
}

export type EpisodeTrigger = UserPrompt | SystemEvent;

/**
 * Step Nodes
 * The internal autonomous actions taken by the agent during its loop.
 */
export interface AgentThought extends BaseConcreteNode {
  readonly type: NodeType.AGENT_THOUGHT;
  readonly role: 'model';
}

export interface ToolExecution extends BaseConcreteNode {
  readonly type: NodeType.TOOL_EXECUTION;
}

export interface MaskedTool extends BaseConcreteNode {
  readonly type: NodeType.MASKED_TOOL;
}

export type EpisodeStep = AgentThought | ToolExecution | MaskedTool;

/**
 * Resolution Node
 * The final message where the agent yields control back to the user.
 */
export interface AgentYield extends BaseConcreteNode {
  readonly type: NodeType.AGENT_YIELD;
  readonly role: 'model';
}

/**
 * Synthetic Leaf Interfaces
 * Processors that generate summaries emit explicit synthetic nodes.
 */
export interface Snapshot extends BaseConcreteNode {
  readonly type: NodeType.SNAPSHOT;
}

export interface RollingSummary extends BaseConcreteNode {
  readonly type: NodeType.ROLLING_SUMMARY;
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

export function isAgentThought(node: Node): node is AgentThought {
  return node.type === NodeType.AGENT_THOUGHT;
}

export function isAgentYield(node: Node): node is AgentYield {
  return node.type === NodeType.AGENT_YIELD;
}

export function isToolExecution(node: Node): node is ToolExecution {
  return node.type === NodeType.TOOL_EXECUTION;
}

export function isMaskedTool(node: Node): node is MaskedTool {
  return node.type === NodeType.MASKED_TOOL;
}

export function isUserPrompt(node: Node): node is UserPrompt {
  return node.type === NodeType.USER_PROMPT;
}

export function isSystemEvent(node: Node): node is SystemEvent {
  return node.type === NodeType.SYSTEM_EVENT;
}

export function isSnapshot(node: Node): node is Snapshot {
  return node.type === NodeType.SNAPSHOT;
}

export function isRollingSummary(node: Node): node is RollingSummary {
  return node.type === NodeType.ROLLING_SUMMARY;
}
