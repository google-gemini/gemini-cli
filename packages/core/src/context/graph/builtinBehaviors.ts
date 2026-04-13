/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part } from '@google/genai';
import type {
  IrNodeBehavior,
  NodeBehaviorRegistry,
} from './behaviorRegistry.js';
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

export const UserPromptBehavior: IrNodeBehavior<UserPrompt> = {
  type: 'USER_PROMPT',
  getEstimatableParts(prompt) {
    const parts: Part[] = [];
    for (const sp of prompt.semanticParts) {
      switch (sp.type) {
        case 'text':
          parts.push({ text: sp.text });
          break;
        case 'inline_data':
          parts.push({ inlineData: { mimeType: sp.mimeType, data: sp.data } });
          break;
        case 'file_data':
          parts.push({
            fileData: { mimeType: sp.mimeType, fileUri: sp.fileUri },
          });
          break;
        case 'raw_part':
          parts.push(sp.part);
          break;
        default:
          break;
      }
    }
    return parts;
  },
  serialize(prompt, writer) {
    const parts = this.getEstimatableParts(prompt);
    if (parts.length > 0) {
      writer.flushModelParts();
      writer.appendContent({ role: 'user', parts });
    }
  },
};

export const AgentThoughtBehavior: IrNodeBehavior<AgentThought> = {
  type: 'AGENT_THOUGHT',
  getEstimatableParts(thought) {
    return [{ text: thought.text }];
  },
  serialize(thought, writer) {
    writer.appendModelPart({ text: thought.text });
  },
};

export const ToolExecutionBehavior: IrNodeBehavior<ToolExecution> = {
  type: 'TOOL_EXECUTION',
  getEstimatableParts(tool) {
    return [
      { functionCall: { id: tool.id, name: tool.toolName, args: tool.intent } },
      {
        functionResponse: {
          id: tool.id,
          name: tool.toolName,
          response:
            typeof tool.observation === 'string'
              ? { message: tool.observation }
              : tool.observation,
        },
      },
    ];
  },
  serialize(tool, writer) {
    const parts = this.getEstimatableParts(tool);
    writer.appendModelPart(parts[0]);
    writer.flushModelParts();
    writer.appendUserPart(parts[1]);
  },
};

export const MaskedToolBehavior: IrNodeBehavior<MaskedTool> = {
  type: 'MASKED_TOOL',
  getEstimatableParts(tool) {
    return [
      {
        functionCall: {
          id: tool.id,
          name: tool.toolName,
          args: tool.intent ?? {},
        },
      },
      {
        functionResponse: {
          id: tool.id,
          name: tool.toolName,
          response:
            typeof tool.observation === 'string'
              ? { message: tool.observation }
              : (tool.observation ?? {}),
        },
      },
    ];
  },
  serialize(tool, writer) {
    const parts = this.getEstimatableParts(tool);
    writer.appendModelPart(parts[0]);
    writer.flushModelParts();
    writer.appendUserPart(parts[1]);
  },
};

export const AgentYieldBehavior: IrNodeBehavior<AgentYield> = {
  type: 'AGENT_YIELD',
  getEstimatableParts(yieldNode) {
    return [{ text: yieldNode.text }];
  },
  serialize(yieldNode, writer) {
    writer.appendModelPart({ text: yieldNode.text });
    writer.flushModelParts();
  },
};

export const SystemEventBehavior: IrNodeBehavior<SystemEvent> = {
  type: 'SYSTEM_EVENT',
  getEstimatableParts() {
    return [];
  },
  serialize(node, writer) {
    writer.flushModelParts();
  },
};

export const SnapshotBehavior: IrNodeBehavior<Snapshot> = {
  type: 'SNAPSHOT',
  getEstimatableParts(node) {
    return [{ text: node.text }];
  },
  serialize(node, writer) {
    writer.flushModelParts();
    writer.appendUserPart({ text: node.text });
  },
};

export const RollingSummaryBehavior: IrNodeBehavior<RollingSummary> = {
  type: 'ROLLING_SUMMARY',
  getEstimatableParts(node) {
    return [{ text: node.text }];
  },
  serialize(node, writer) {
    writer.flushModelParts();
    writer.appendUserPart({ text: node.text });
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
