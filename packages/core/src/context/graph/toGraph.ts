/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import type { ConcreteNode, Episode } from './types.js';
import { randomUUID, createHash } from 'node:crypto';
import { debugLogger } from '../../utils/debugLogger.js';

interface PartWithSynthId extends Part {
  _synthId?: string;
}

function isTextPart(part: Part): part is Part & { text: string } {
  return typeof part.text === 'string';
}

function isInlineDataPart(
  part: Part,
): part is Part & { inlineData: { data: string } } {
  return (
    typeof part.inlineData === 'object' &&
    part.inlineData !== null &&
    typeof part.inlineData.data === 'string'
  );
}

function isFileDataPart(
  part: Part,
): part is Part & { fileData: { fileUri: string } } {
  return (
    typeof part.fileData === 'object' &&
    part.fileData !== null &&
    typeof part.fileData.fileUri === 'string'
  );
}

function isFunctionCallPart(
  part: Part,
): part is Part & { functionCall: { id: string; name: string } } {
  return (
    typeof part.functionCall === 'object' &&
    part.functionCall !== null &&
    typeof part.functionCall.name === 'string'
  );
}

function isFunctionResponsePart(
  part: Part,
): part is Part & { functionResponse: { id: string; name: string } } {
  return (
    typeof part.functionResponse === 'object' &&
    part.functionResponse !== null &&
    typeof part.functionResponse.name === 'string'
  );
}

/**
 * Generates a stable ID for an object reference using a WeakMap.
 * Falls back to content-based hashing for Part-like objects to ensure
 * stability across object re-creations (e.g. during history mapping).
 */
export function getStableId(
  obj: object,
  nodeIdentityMap: WeakMap<object, string>,
  turnSalt: string = '',
  partIdx: number = 0,
): string {
  let id = nodeIdentityMap.get(obj);
  if (id) return id;

  const part = obj as PartWithSynthId;
  // If the object already has a synthetic ID property, use it.
  if (typeof part._synthId === 'string') {
    id = part._synthId;
  } else if (isTextPart(part)) {
    // Content-based ID for text parts, salted with turn-stable salt for uniqueness
    const hash = createHash('md5')
      .update(`${turnSalt}:${partIdx}:${part.text}`)
      .digest('hex');
    id = `text_${hash}`;
  } else if (isInlineDataPart(part)) {
    // Content-based ID for inline media
    const hash = createHash('md5')
      .update(`${turnSalt}:${partIdx}:${part.inlineData.data}`)
      .digest('hex');
    id = `media_${hash}`;
  } else if (isFileDataPart(part)) {
    id = `file_${turnSalt}_${partIdx}_${createHash('md5')
      .update(part.fileData.fileUri)
      .digest('hex')}`;
  } else if (isFunctionCallPart(part)) {
    const hash = createHash('md5')
      .update(
        `${turnSalt}:${partIdx}:call:${part.functionCall.name}:${JSON.stringify(part.functionCall.args)}`,
      )
      .digest('hex');
    id = `call_h_${hash}`;
  } else if (isFunctionResponsePart(part)) {
    const hash = createHash('md5')
      .update(
        `${turnSalt}:${partIdx}:resp:${part.functionResponse.name}:${JSON.stringify(part.functionResponse.response)}`,
      )
      .digest('hex');
    id = `resp_h_${hash}`;
  }

  if (!id) {
    id = randomUUID();
  }

  nodeIdentityMap.set(obj, id);
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

    // Tracks occurrences of identical turn content to ensure unique stable IDs
    const seenHashes = new Map<string, number>();

    for (let turnIdx = 0; turnIdx < history.length; turnIdx++) {
      const msg = history[turnIdx];
      if (!msg.parts) continue;

      // Generate a stable salt for this turn based on its role and content
      // This remains stable even if the turn's index in history changes.
      const turnContent = JSON.stringify(msg.parts);
      const h = createHash('md5')
        .update(`${msg.role}:${turnContent}`)
        .digest('hex');
      const occurrence = (seenHashes.get(h) || 0) + 1;
      seenHashes.set(h, occurrence);
      const turnSalt = `${h}_${occurrence}`;

      if (msg.role === 'user') {
        const hasUserParts = msg.parts.some(
          (p) => !!p.text || !!p.inlineData || !!p.fileData,
        );

        // A user text message starts a new logical episode
        if (hasUserParts) {
          finalizeEpisode();
          currentEpisodeId = getStableId(
            msg,
            this.nodeIdentityMap,
            turnSalt,
            0,
          );
          currentEpisode = {
            id: currentEpisodeId,
            concreteNodes: [],
          };
        }

        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionResponsePart(part) &&
            typeof part.functionResponse.id === 'string'
              ? `resp_${part.functionResponse.id}`
              : isFunctionCallPart(part) &&
                  typeof part.functionCall.id === 'string'
                ? `call_${part.functionCall.id}`
                : undefined;
          const id =
            apiId || getStableId(part, this.nodeIdentityMap, turnSalt, partIdx);

          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: isFunctionResponsePart(part)
              ? 'TOOL_EXECUTION'
              : 'USER_PROMPT',
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
          currentEpisodeId = getStableId(
            msg,
            this.nodeIdentityMap,
            turnSalt,
            0,
          );
          currentEpisode = {
            id: currentEpisodeId,
            concreteNodes: [],
          };
        }

        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionCallPart(part) && typeof part.functionCall.id === 'string'
              ? `call_${part.functionCall.id}`
              : undefined;
          const id =
            apiId || getStableId(part, this.nodeIdentityMap, turnSalt, partIdx);

          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: isFunctionCallPart(part) ? 'TOOL_EXECUTION' : 'AGENT_THOUGHT',
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
