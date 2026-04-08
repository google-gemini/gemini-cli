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
} from './types.js';
import { isAgentThought, isAgentYield, isSystemEvent, isSnapshot, isRollingSummary, isMaskedTool, isToolExecution, isUserPrompt } from './graphUtils.js';

export function fromIr(ship: readonly ConcreteNode[]): Content[] {
  const history: Content[] = [];
  const agentParts: Part[] = [];

  const flushAgentParts = () => {
    if (agentParts.length > 0) {
      history.push({ role: 'model', parts: [...agentParts] });
      agentParts.length = 0;
    }
  };

  for (const node of ship) {
    if (isUserPrompt(node)) {
      flushAgentParts();
      const content = serializeUserPrompt(node);
      if (content) history.push(content);
    } else if (isSystemEvent(node)) {
      flushAgentParts();
      // System events do not map strictly to Gemini Content parts unless synthesized.
    } else if (isAgentThought(node)) {
      agentParts.push(serializeAgentThought(node));
    } else if (isToolExecution(node)) {
      const parts = serializeToolExecution(node);
      agentParts.push(parts.call);
      flushAgentParts();
      history.push({ role: 'user', parts: [parts.response] });
    } else if (isMaskedTool(node)) {
      const parts = serializeMaskedTool(node);
      agentParts.push(parts.call);
      flushAgentParts();
      history.push({ role: 'user', parts: [parts.response] });
    } else if (isAgentYield(node)) {
      agentParts.push(serializeAgentYield(node));
      flushAgentParts();
    } else if (isSnapshot(node)) {
      flushAgentParts();
      history.push({ role: 'user', parts: [{ text: (node).text }] });
    } else if (isRollingSummary(node)) {
      flushAgentParts();
      history.push({ role: 'user', parts: [{ text: (node).text }] });
    }
  }

  flushAgentParts();
  return history;
}

export function serializeUserPrompt(prompt: UserPrompt): Content | null {
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

export function serializeAgentThought(thought: AgentThought): Part {
  return { text: thought.text };
}

export function serializeToolExecution(
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
        response: typeof tool.observation === "string" ? { message: tool.observation } : tool.observation,
      },
    },
  };
}

export function serializeMaskedTool(
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

export function serializeAgentYield(yieldNode: AgentYield): Part {
  return { text: yieldNode.text };
}
