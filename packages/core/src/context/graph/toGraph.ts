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

import { debugLogger } from '../../utils/debugLogger.js';

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
  constructor(
    private readonly tokenCalculator: ContextTokenCalculator,
    private readonly nodeIdentityMap: WeakMap<object, string> = new WeakMap(),
  ) {}

  processHistory(history: readonly Content[]): ConcreteNode[] {
    debugLogger.log(
      `[ContextGraphBuilder] Processing history with ${history.length} items`,
    );
    const episodes: Episode[] = [];
    let currentEpisode: Partial<Episode> | null = null;
    const pendingCallParts = new Map<string, Part>();

    const finalizeEpisode = () => {
      if (currentEpisode && isCompleteEpisode(currentEpisode)) {
        debugLogger.log(
          `[ContextGraphBuilder] Finalizing episode ${currentEpisode.id} with ${currentEpisode.concreteNodes.length} nodes`,
        );
        episodes.push(currentEpisode);
      }
      currentEpisode = null;
    };

    for (const msg of history) {
      if (!msg.parts) continue;

      if (msg.role === 'user') {
        const hasToolResponses = msg.parts.some((p) => !!p.functionResponse);
        const hasUserParts = msg.parts.some(
          (p) => !!p.text || !!p.inlineData || !!p.fileData,
        );

        if (hasToolResponses) {
          currentEpisode = parseToolResponses(
            msg,
            currentEpisode,
            pendingCallParts,
            this.tokenCalculator,
            this.nodeIdentityMap,
          );
        }

        if (hasUserParts) {
          finalizeEpisode();
          currentEpisode = parseUserParts(msg, this.nodeIdentityMap);
        }
      } else if (msg.role === 'model') {
        currentEpisode = parseModelParts(
          msg,
          currentEpisode,
          pendingCallParts,
          this.nodeIdentityMap,
        );
      }
    }

    const copy = [...episodes];
    if (currentEpisode) {
      const activeEp = {
        ...currentEpisode,
        concreteNodes: [...(currentEpisode.concreteNodes || [])],
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
    debugLogger.log(
      `[ContextGraphBuilder] Finished processing. Generated ${nodes.length} nodes from ${copy.length} episodes.`,
    );
    return nodes;
  }
}

function parseToolResponses(
  msg: Content,
  currentEpisode: Partial<Episode> | null,
  pendingCallParts: Map<string, Part>,
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
      const matchingCall = pendingCallParts.get(callId);

      if (!matchingCall) {
        debugLogger.error(
          `[ContextGraphBuilder] MISSING_CALL: No matching functionCall for id='${callId}' name='${part.functionResponse.name}'`,
        );
      } else {
        debugLogger.log(
          `[ContextGraphBuilder] MATCH_SUCCESS: Found call for id='${callId}'`,
        );
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
        thoughtSignature: matchingCall?.thoughtSignature,
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
        debugLogger.log(
          `[ContextGraphBuilder] RECORD_CALL: id='${callId}' name='${part.functionCall.name}'`,
        );
        pendingCallParts.set(callId, part);
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
