/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode, Task, IrNode, AgentThought, ToolExecution, MaskedTool, UserPrompt, AgentYield, SystemEvent, Snapshot, RollingSummary } from './types.js';

export function isEpisode(node: IrNode): node is Episode {
  return node.type === 'EPISODE';
}

export function isTask(node: IrNode): node is Task {
  return node.type === 'TASK';
}

export function isAgentThought(node: IrNode): node is AgentThought {
  return node.type === 'AGENT_THOUGHT';
}

export function isAgentYield(node: IrNode): node is AgentYield {
  return node.type === 'AGENT_YIELD';
}

export function isToolExecution(node: IrNode): node is ToolExecution {
  return node.type === 'TOOL_EXECUTION';
}

export function isMaskedTool(node: IrNode): node is MaskedTool {
  return node.type === 'MASKED_TOOL';
}

export function isUserPrompt(node: IrNode): node is UserPrompt {
  return node.type === 'USER_PROMPT';
}

export function isSystemEvent(node: IrNode): node is SystemEvent {
  return node.type === 'SYSTEM_EVENT';
}
export function isSnapshot(node: IrNode): node is Snapshot {
  return node.type === 'SNAPSHOT';
}
export function isRollingSummary(node: IrNode): node is RollingSummary {
  return node.type === 'ROLLING_SUMMARY';
}