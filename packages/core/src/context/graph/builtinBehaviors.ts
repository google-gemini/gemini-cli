/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { NodeBehavior, NodeBehaviorRegistry } from './behaviorRegistry.js';
import type {
  UserPrompt,
  AgentThought,
  ToolExecution,
  MaskedTool,
  AgentYield,
  Snapshot,
  RollingSummary,
  SystemEvent,
} from './types.js';

export const UserPromptBehavior: NodeBehavior<UserPrompt> = {
  type: 'USER_PROMPT',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {}, // fromGraph handles serialization losslessly
};

export const AgentThoughtBehavior: NodeBehavior<AgentThought> = {
  type: 'AGENT_THOUGHT',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
};

export const ToolExecutionBehavior: NodeBehavior<ToolExecution> = {
  type: 'TOOL_EXECUTION',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
};

export const MaskedToolBehavior: NodeBehavior<MaskedTool> = {
  type: 'MASKED_TOOL',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
};

export const AgentYieldBehavior: NodeBehavior<AgentYield> = {
  type: 'AGENT_YIELD',
  getEstimatableParts() {
    return [];
  },
  serialize() {},
};

export const SystemEventBehavior: NodeBehavior<SystemEvent> = {
  type: 'SYSTEM_EVENT',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
};

export const SnapshotBehavior: NodeBehavior<Snapshot> = {
  type: 'SNAPSHOT',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
};

export const RollingSummaryBehavior: NodeBehavior<RollingSummary> = {
  type: 'ROLLING_SUMMARY',
  getEstimatableParts(node) {
    return [node.payload];
  },
  serialize() {},
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
