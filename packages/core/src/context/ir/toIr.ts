/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { randomUUID } from 'node:crypto';
import type {
  Episode,
  IrMetadata,
  SemanticPart,
  ToolExecution,
  AgentThought,
  AgentYield,
  UserPrompt,
  SystemEvent,
} from './types.js';
import { estimateContextTokenCountSync } from '../utils/contextTokenCalculator.js';

// WeakMap to provide stable, deterministic identity across parses for the exact same Content/Part references
const nodeIdentityMap = new WeakMap<object, string>();

export function getStableId(obj: object): string {
  let id = nodeIdentityMap.get(obj);
  if (!id) {
    id = randomUUID();
    nodeIdentityMap.set(obj, id);
  }
  return id;
}

export let charsPerTokenConfig: { charsPerToken?: number } | undefined;

export function setMapperConfig(cfg: { charsPerToken?: number }) {
  charsPerTokenConfig = cfg;
}

export function createMetadata(parts: Part[]): IrMetadata {
  const tokens = estimateContextTokenCountSync(parts, 0, charsPerTokenConfig);
  return {
    originalTokens: tokens,
    currentTokens: tokens,
    transformations: [],
  };
}

export function toIr(history: readonly Content[]): Episode[] {
  const episodes: Episode[] = [];
  let currentEpisode: Partial<Episode> | null = null;
  const pendingCallParts: Map<string, Part> = new Map();

  const finalizeEpisode = () => {
    if (currentEpisode && currentEpisode.trigger) {
      episodes.push(currentEpisode as unknown as Episode); // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
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
        currentEpisode = parseToolResponses(msg, currentEpisode, pendingCallParts);
      }

      if (hasUserParts) {
        finalizeEpisode();
        currentEpisode = parseUserParts(msg);
      }
    } else if (msg.role === 'model') {
      currentEpisode = parseModelParts(msg, currentEpisode, pendingCallParts);
    }
  }

  if (currentEpisode) {
    finalizeYield(currentEpisode);
    finalizeEpisode();
  }

  return episodes;
}

function parseToolResponses(
  msg: Content,
  currentEpisode: Partial<Episode> | null,
  pendingCallParts: Map<string, Part>,
): Partial<Episode> {
  if (!currentEpisode) {
    currentEpisode = {
      id: getStableId(msg),
      timestamp: Date.now(),
      trigger: {
        id: getStableId(msg.parts![0] || msg),
        type: 'SYSTEM_EVENT',
        name: 'history_resume',
        payload: {},
        metadata: createMetadata([]),
      } as SystemEvent,
      steps: [],
    };
  }

  for (const part of msg.parts!) {
    if (part.functionResponse) {
      const callId = part.functionResponse.id || '';
      const matchingCall = pendingCallParts.get(callId);

      const intentTokens = matchingCall
        ? estimateContextTokenCountSync([matchingCall])
        : 0;
      const obsTokens = estimateContextTokenCountSync([part]);

      const step: ToolExecution = {
        id: getStableId(part),
        type: 'TOOL_EXECUTION',
        toolName: part.functionResponse.name || 'unknown',
        intent:
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (matchingCall?.functionCall?.args as unknown as Record<
            string,
            unknown
          >) || {},
        observation:
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (part.functionResponse.response as unknown as Record<
            string,
            unknown
          >) || {},
        tokens: {
          intent: intentTokens,
          observation: obsTokens,
        },
        metadata: {
          originalTokens: intentTokens + obsTokens,
          currentTokens: intentTokens + obsTokens,
          transformations: [],
        },
      };
      currentEpisode.steps!.push(step);
      if (callId) pendingCallParts.delete(callId);
    }
  }
  return currentEpisode;
}

function parseUserParts(msg: Content): Partial<Episode> {
  const semanticParts: SemanticPart[] = [];
  for (const p of msg.parts!) {
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

  const trigger: UserPrompt = {
    id: getStableId(msg.parts![0] || msg),
    type: 'USER_PROMPT',
    semanticParts,
    metadata: createMetadata(
      msg.parts!.filter((p) => !p.functionResponse),
    ),
  };

  return {
    id: getStableId(msg),
    timestamp: Date.now(),
    trigger,
    steps: [],
  };
}

function parseModelParts(
  msg: Content,
  currentEpisode: Partial<Episode> | null,
  pendingCallParts: Map<string, Part>,
): Partial<Episode> {
  if (!currentEpisode) {
    currentEpisode = {
      id: getStableId(msg),
      timestamp: Date.now(),
      trigger: {
        id: getStableId(msg.parts![0] || msg),
        type: 'SYSTEM_EVENT',
        name: 'model_init',
        payload: {},
        metadata: createMetadata([]),
      } as SystemEvent,
      steps: [],
    };
  }

  for (const part of msg.parts!) {
    if (part.functionCall) {
      const callId = part.functionCall.id || '';
      if (callId) pendingCallParts.set(callId, part);
    } else if (part.text) {
      const thought: AgentThought = {
        id: getStableId(part),
        type: 'AGENT_THOUGHT',
        text: part.text,
        metadata: createMetadata([part]),
      };
      currentEpisode.steps!.push(thought);
    }
  }
  return currentEpisode;
}

function finalizeYield(currentEpisode: Partial<Episode>) {
  if (currentEpisode.steps && currentEpisode.steps.length > 0) {
    const lastStep = currentEpisode.steps[currentEpisode.steps.length - 1];
    if (lastStep.type === 'AGENT_THOUGHT') {
      const yieldNode: AgentYield = {
        id: lastStep.id,
        type: 'AGENT_YIELD',
        text: lastStep.text,
        metadata: lastStep.metadata,
      };
      currentEpisode.steps.pop();
      currentEpisode.yield = yieldNode;
    }
  }
}
