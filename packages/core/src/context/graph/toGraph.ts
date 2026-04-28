/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode, Episode } from './types.js';
import { randomUUID } from 'node:crypto';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Generates a stable ID for an object reference using a WeakMap.
 */
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

/**
 * Builds a 1:1 Mirror Graph from Chat History.
 * Every Part in history is mapped to exactly one ConcreteNode.
 */
export class ContextGraphBuilder {
  constructor(
    private readonly nodeIdentityMap: WeakMap<object, string> = new WeakMap(),
  ) {}

  processHistory(history: readonly Content[]): ConcreteNode[] {
    const episodes: Episode[] = [];
    let currentEpisode: Partial<Episode> | null = null;
    let currentEpisodeId: string | undefined;

    const finalizeEpisode = () => {
      if (currentEpisode && isCompleteEpisode(currentEpisode)) {
        episodes.push(currentEpisode);
      }
      currentEpisode = null;
      currentEpisodeId = undefined;
    };

    const nodes: ConcreteNode[] = [];

    for (const msg of history) {
      if (!msg.parts) continue;

      if (msg.role === 'user') {
        const hasUserParts = msg.parts.some(
          (p) => !!p.text || !!p.inlineData || !!p.fileData,
        );

        // A user text message starts a new logical episode
        if (hasUserParts) {
          finalizeEpisode();
          currentEpisodeId = getStableId(msg, this.nodeIdentityMap);
          currentEpisode = {
            id: currentEpisodeId,
            concreteNodes: [],
          };
        }

        for (const part of msg.parts) {
          const id = getStableId(part, this.nodeIdentityMap);
          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: part.functionResponse ? 'TOOL_EXECUTION' : 'USER_PROMPT',
            role: 'user',
            payload: part,
            logicalParentId: currentEpisodeId,
          };
          nodes.push(node);
          if (currentEpisode) {
            currentEpisode.concreteNodes = [
              ...(currentEpisode.concreteNodes || []),
              node,
            ];
          }
        }
      } else if (msg.role === 'model') {
        // Model turns belong to the current episode (if one exists) or start a new one
        if (!currentEpisode) {
          currentEpisodeId = getStableId(msg, this.nodeIdentityMap);
          currentEpisode = {
            id: currentEpisodeId,
            concreteNodes: [],
          };
        }

        for (const part of msg.parts) {
          const id = getStableId(part, this.nodeIdentityMap);
          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: part.functionCall ? 'TOOL_EXECUTION' : 'AGENT_THOUGHT',
            role: 'model',
            payload: part,
            logicalParentId: currentEpisodeId,
          };
          nodes.push(node);
          if (currentEpisode) {
            currentEpisode.concreteNodes = [
              ...(currentEpisode.concreteNodes || []),
              node,
            ];
          }
        }
      }
    }

    if (currentEpisode && isCompleteEpisode(currentEpisode)) {
      episodes.push(currentEpisode);
    }

    debugLogger.log(
      `[ContextGraphBuilder] Mirror Graph built with ${nodes.length} nodes across ${episodes.length} episodes.`,
    );
    return nodes;
  }
}
