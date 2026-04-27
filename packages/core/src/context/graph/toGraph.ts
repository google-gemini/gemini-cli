/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type {
  ConcreteNode,
  Episode,
  SemanticPart,
  ToolExecution,
  AgentThought,
  AgentYield,
  UserPrompt,
} from './types.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import { randomUUID } from 'node:crypto';
import { isRecord } from '../../utils/markdownUtils.js';

// We remove the global nodeIdentityMap and instead rely on one passed from ContextGraphMapper
export function getStableId(
  obj: object,
  nodeIdentityMap: WeakMap<object, string>,
): string {
  let id = nodeIdentityMap.get(obj);
  if (!id) {
    id = randomUUID();
    nodeIdentityMap.set(obj, id);
  }
  return id;
}

function isCompleteEpisode(ep: Partial<Episode>): ep is Episode {
  return (
    typeof ep.id === 'string' &&
    Array.isArray(ep.concreteNodes) &&
    ep.concreteNodes.length > 0
  );
}

export class ContextGraphBuilder {
  private episodes: Episode[] = [];
  private currentEpisode: Partial<Episode> | null = null;
  private pendingCallParts: Map<string, Part> = new Map();
  private pendingCallPartsWithoutId: Part[] = [];

  constructor(
    private readonly tokenCalculator: ContextTokenCalculator,
    private readonly nodeIdentityMap: WeakMap<object, string> = new WeakMap(),
  ) {}

  clear() {
    this.episodes = [];
    this.currentEpisode = null;
    this.pendingCallParts.clear();
    this.pendingCallPartsWithoutId = [];
  }

  processHistory(history: readonly Content[]) {
    const finalizeEpisode = () => {
      if (this.currentEpisode && isCompleteEpisode(this.currentEpisode)) {
        this.episodes.push(this.currentEpisode);
      }
      this.currentEpisode = null;
    };

    for (const msg of history) {
      if (!msg.parts) continue;

      if (msg.role === 'user') {
        const hasToolResponses = msg.parts.some((p) => !!p.functionResponse);
        const hasUserParts = msg.parts.some(
          (p) => !!p.text || !!p.inlineData || !!p.fileData,
        );

        if (hasToolResponses) {
          this.currentEpisode = parseToolResponses(
            msg,
            this.currentEpisode,
            this.pendingCallParts,
            this.pendingCallPartsWithoutId,
            this.tokenCalculator,
            this.nodeIdentityMap,
          );
        }

        if (hasUserParts) {
          finalizeEpisode();
          this.currentEpisode = parseUserParts(msg, this.nodeIdentityMap);
        }
      } else if (msg.role === 'model') {
        this.currentEpisode = parseModelParts(
          msg,
          this.currentEpisode,
          this.pendingCallParts,
          this.pendingCallPartsWithoutId,
          this.nodeIdentityMap,
        );
      }
    }
  }

  getNodes(): ConcreteNode[] {
    const copy = [...this.episodes];
    if (this.currentEpisode) {
      const activeEp = {
        ...this.currentEpisode,
        concreteNodes: [...(this.currentEpisode.concreteNodes || [])],
      };
      finalizeYield(activeEp);
      if (isCompleteEpisode(activeEp)) {
        copy.push(activeEp);
      }
    }

    const nodes: ConcreteNode[] = [];
    for (const ep of copy) {
      if (ep.concreteNodes) {
        for (const child of ep.concreteNodes) {
          nodes.push(child);
        }
      }
    }
    return nodes;
  }
}

function parseToolResponses(
  msg: Content,
  currentEpisode: Partial<Episode> | null,
  pendingCallParts: Map<string, Part>,
  pendingCallPartsWithoutId: Part[],
  tokenCalculator: ContextTokenCalculator,
  nodeIdentityMap: WeakMap<object, string>,
): Partial<Episode> {
  if (!currentEpisode) {
    currentEpisode = {
      id: getStableId(msg, nodeIdentityMap),

      concreteNodes: [],
    };
  }

  const parts = msg.parts || [];
  for (const part of parts) {
    if (part.functionResponse) {
      const callId = part.functionResponse.id || '';
      let matchingCall = pendingCallParts.get(callId);

      if (!matchingCall && pendingCallPartsWithoutId.length > 0) {
        const idx = pendingCallPartsWithoutId.findIndex(
          (p) => p.functionCall?.name === part.functionResponse!.name,
        );
        if (idx !== -1) {
          matchingCall = pendingCallPartsWithoutId[idx];
          pendingCallPartsWithoutId.splice(idx, 1);
        } else {
          matchingCall = pendingCallPartsWithoutId.shift();
        }
      }

      const intentTokens = matchingCall
        ? tokenCalculator.estimateTokensForParts([matchingCall])
        : 0;
      const obsTokens = tokenCalculator.estimateTokensForParts([part]);

      const step: ToolExecution = {
        id: getStableId(part, nodeIdentityMap),
        timestamp: Date.now(),
        type: 'TOOL_EXECUTION',
        toolName: part.functionResponse.name || 'unknown',
        intent: isRecord(matchingCall?.functionCall?.args)
          ? matchingCall.functionCall.args
          : {},
        observation: isRecord(part.functionResponse.response)
          ? part.functionResponse.response
          : {},
        tokens: {
          intent: intentTokens,
          observation: obsTokens,
        },
      };

      currentEpisode.concreteNodes = [
        ...(currentEpisode.concreteNodes || []),
        step,
      ];
      if (callId) pendingCallParts.delete(callId);
    }
  }
  return currentEpisode;
}

function parseUserParts(
  msg: Content,
  nodeIdentityMap: WeakMap<object, string>,
): Partial<Episode> {
  const semanticParts: SemanticPart[] = [];
  const parts = msg.parts || [];
  for (const p of parts) {
    if (p.text !== undefined)
      semanticParts.push({ type: 'text', text: p.text });
    else if (p.inlineData)
      semanticParts.push({
        type: 'inline_data',
        mimeType: p.inlineData.mimeType || '',
        data: p.inlineData.data || '',
      });
    else if (p.fileData)
      semanticParts.push({
        type: 'file_data',
        mimeType: p.fileData.mimeType || '',
        fileUri: p.fileData.fileUri || '',
      });
    else if (!p.functionResponse)
      semanticParts.push({ type: 'raw_part', part: p }); // Preserve unknowns
  }

  const baseObj = parts.length > 0 ? parts[0] : msg;
  const trigger: UserPrompt = {
    id: getStableId(baseObj, nodeIdentityMap),
    timestamp: Date.now(),
    type: 'USER_PROMPT',
    semanticParts,
  };
  return {
    id: getStableId(msg, nodeIdentityMap),

    concreteNodes: [trigger],
  };
}

function parseModelParts(
  msg: Content,
  currentEpisode: Partial<Episode> | null,
  pendingCallParts: Map<string, Part>,
  pendingCallPartsWithoutId: Part[],
  nodeIdentityMap: WeakMap<object, string>,
): Partial<Episode> {
  if (!currentEpisode) {
    currentEpisode = {
      id: getStableId(msg, nodeIdentityMap),

      concreteNodes: [],
    };
  }

  const parts = msg.parts || [];
  for (const part of parts) {
    if (part.functionCall) {
      const callId = part.functionCall.id || '';
      if (callId) {
        pendingCallParts.set(callId, part);
      } else {
        const lastIdx = pendingCallPartsWithoutId.length - 1;
        const lastPart = pendingCallPartsWithoutId[lastIdx];

        if (
          lastPart &&
          lastPart.functionCall &&
          lastPart.functionCall.name === part.functionCall.name
        ) {
          // Replace the previous chunk with the more complete one
          pendingCallPartsWithoutId[lastIdx] = part;
        } else {
          pendingCallPartsWithoutId.push(part);
        }
      }
    } else if (part.text) {
      const thought: AgentThought = {
        id: getStableId(part, nodeIdentityMap),
        timestamp: Date.now(),
        type: 'AGENT_THOUGHT',
        text: part.text,
      };

      currentEpisode.concreteNodes = [
        ...(currentEpisode.concreteNodes || []),
        thought,
      ];
    }
  }
  return currentEpisode;
}

function finalizeYield(currentEpisode: Partial<Episode>) {
  if (currentEpisode.concreteNodes && currentEpisode.concreteNodes.length > 0) {
    const yieldNode: AgentYield = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'AGENT_YIELD',
      text: 'Yield', // Synthesized yield since we don't have the original concrete node
    };
    const existingNodes = currentEpisode.concreteNodes || [];
    currentEpisode.concreteNodes = [...existingNodes, yieldNode];
  }
}
