/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type {
  ConcreteNode,
  UserPrompt,
  AgentThought,
  ToolExecution,
  AgentYield,
  MaskedTool,
  Snapshot,
  RollingSummary,
} from './types.js';

export function fromIr(ship: ReadonlyArray<ConcreteNode>): Content[] {
  const history: Content[] = [];
  const agentParts: Part[] = [];

  const flushAgentParts = () => {
    if (agentParts.length > 0) {
      history.push({ role: 'model', parts: [...agentParts] });
      agentParts.length = 0;
    }
  };

  for (const node of ship) {
    if (node.type === 'USER_PROMPT') {
      flushAgentParts();
      const content = serializeUserPrompt(node as UserPrompt);
      if (content) history.push(content);
    } else if (node.type === 'SYSTEM_EVENT') {
      flushAgentParts();
      // System events do not map strictly to Gemini Content parts unless synthesized.
    } else if (node.type === 'AGENT_THOUGHT') {
      agentParts.push(serializeAgentThought(node as AgentThought));
    } else if (node.type === 'TOOL_EXECUTION') {
      const parts = serializeToolExecution(node as ToolExecution);
      agentParts.push(parts.call);
      flushAgentParts();
      history.push({ role: 'user', parts: [parts.response] });
    } else if (node.type === 'MASKED_TOOL') {
      const parts = serializeMaskedTool(node as MaskedTool);
      agentParts.push(parts.call);
      flushAgentParts();
      history.push({ role: 'user', parts: [parts.response] });
    } else if (node.type === 'AGENT_YIELD') {
      agentParts.push(serializeAgentYield(node as AgentYield));
      flushAgentParts();
    } else if (node.type === 'SNAPSHOT') {
      flushAgentParts();
      history.push({ role: 'user', parts: [{ text: (node as Snapshot).text }] });
    } else if (node.type === 'ROLLING_SUMMARY') {
      flushAgentParts();
      history.push({ role: 'user', parts: [{ text: (node as RollingSummary).text }] });
    }
  }

  flushAgentParts();
  return history;
}

function serializeUserPrompt(prompt: UserPrompt): Content | null {
  const parts: Part[] = [];
  for (const sp of prompt.semanticParts) {
    if (sp.type === 'text') {
      parts.push({ text: sp.text });
    } else if (sp.type === 'inline_data') {
      parts.push({
        inlineData: { mimeType: sp.mimeType, data: sp.data },
      });
    } else if (sp.type === 'file_data') {
      parts.push({
        fileData: { mimeType: sp.mimeType, fileUri: sp.fileUri },
      });
    } else if (sp.type === 'raw_part') {
      parts.push(sp.part);
    }
  }
  return parts.length > 0 ? { role: 'user', parts } : null;
}

function serializeAgentThought(thought: AgentThought): Part {
  return { text: thought.text };
}

function serializeToolExecution(
  tool: ToolExecution,
): { call: Part; response: Part } {
  return {
    call: {
      functionCall: {
        id: tool.id,
        name: tool.toolName,
        args: tool.intent,
      },
    },
    response: {
      functionResponse: {
        id: tool.id,
        name: tool.toolName,
        response: typeof tool.observation === "string" ? { message: tool.observation } : tool.observation as Record<string, unknown>,
      },
    },
  };
}

function serializeMaskedTool(
  tool: MaskedTool,
): { call: Part; response: Part } {
  return {
    call: {
      functionCall: {
        id: tool.id,
        name: tool.toolName,
        args: tool.intent ?? {},
      },
    },
    response: {
      functionResponse: {
        id: tool.id,
        name: tool.toolName,
        response: typeof tool.observation === 'string' ? { message: tool.observation } : (tool.observation ?? {}),
      },
    },
  };
}

function serializeAgentYield(yieldNode: AgentYield): Part {
  return { text: yieldNode.text };
}
