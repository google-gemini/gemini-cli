/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode, Task, IrNode, AgentThought, ToolExecution, MaskedTool, UserPrompt, AgentYield, SystemEvent, Snapshot, RollingSummary } from './types.js';
import type { ContextTracer } from '../tracer.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

export function isEpisode(node: IrNode): node is Episode {
  return node.type === 'EPISODE';
}

export function isTask(node: IrNode): node is Task {
  return node.type === 'TASK';
}

export function isAgentThought(node: IrNode): node is AgentThought {
  return node.type === 'AGENT_THOUGHT';
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

