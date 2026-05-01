/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { NodeBehavior, NodeBehaviorRegistry } from './behaviorRegistry.js';
import {
  type UserPrompt,
  type AgentThought,
  type ToolExecution,
  type MaskedTool,
  type AgentYield,
  type Snapshot,
  type RollingSummary,
  type SystemEvent,
  NodeType,
} from './types.js';

export const UserPromptBehavior: NodeBehavior<UserPrompt> = {
  type: NodeType.USER_PROMPT,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const AgentThoughtBehavior: NodeBehavior<AgentThought> = {
  type: NodeType.AGENT_THOUGHT,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const ToolExecutionBehavior: NodeBehavior<ToolExecution> = {
  type: NodeType.TOOL_EXECUTION,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const MaskedToolBehavior: NodeBehavior<MaskedTool> = {
  type: NodeType.MASKED_TOOL,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const AgentYieldBehavior: NodeBehavior<AgentYield> = {
  type: NodeType.AGENT_YIELD,
  getEstimatableParts() {
    return [];
  },
};

export const SystemEventBehavior: NodeBehavior<SystemEvent> = {
  type: NodeType.SYSTEM_EVENT,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const SnapshotBehavior: NodeBehavior<Snapshot> = {
  type: NodeType.SNAPSHOT,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export const RollingSummaryBehavior: NodeBehavior<RollingSummary> = {
  type: NodeType.ROLLING_SUMMARY,
  getEstimatableParts(node) {
    return [node.payload];
  },
};

export function registerBuiltInBehaviors(registry: NodeBehaviorRegistry) {
  registry.register(UserPromptBehavior);
  registry.register(AgentThoughtBehavior);
  registry.register(ToolExecutionBehavior);
  registry.register(MaskedToolBehavior);
  registry.register(AgentYieldBehavior);
  registry.register(SystemEventBehavior);
  registry.register(SnapshotBehavior);
  registry.register(RollingSummaryBehavior);
}
