/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from '@google/genai';
import { type ConcreteNode, NodeType } from './types.js';
import { randomUUID, createHash } from 'node:crypto';
import { debugLogger } from '../../utils/debugLogger.js';

interface PartWithSynthId extends Part {
  _synthId?: string;
}

// Global WeakMap to cache hashes for Part objects.
// This optimizes getStableId by avoiding redundant stringify/hash operations
// on the same object instances across multiple management passes.
const PART_HASH_CACHE = new WeakMap<object, string>();

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

  const cachedHash = PART_HASH_CACHE.get(obj);
  if (cachedHash) {
    id = `${cachedHash}_${turnSalt}_${partIdx}`;
    nodeIdentityMap.set(obj, id);
    return id;
  }

  const part = obj as PartWithSynthId;
  let contentHash: string | undefined;

  // If the object already has a synthetic ID property, use it.
  if (typeof part._synthId === 'string') {
    id = part._synthId;
  } else if (isTextPart(part)) {
    contentHash = createHash('sha256').update(part.text).digest('hex');
    id = `text_${contentHash}_${turnSalt}_${partIdx}`;
  } else if (isInlineDataPart(part)) {
    contentHash = createHash('sha256')
      .update(part.inlineData.data)
      .digest('hex');
    id = `media_${contentHash}_${turnSalt}_${partIdx}`;
  } else if (isFileDataPart(part)) {
    contentHash = createHash('sha256')
      .update(part.fileData.fileUri)
      .digest('hex');
    id = `file_${contentHash}_${turnSalt}_${partIdx}`;
  } else if (isFunctionCallPart(part)) {
    contentHash = createHash('sha256')
      .update(
        `call:${part.functionCall.name}:${JSON.stringify(part.functionCall.args)}`,
      )
      .digest('hex');
    id = `call_h_${contentHash}_${turnSalt}_${partIdx}`;
  } else if (isFunctionResponsePart(part)) {
    contentHash = createHash('sha256')
      .update(
        `resp:${part.functionResponse.name}:${JSON.stringify(part.functionResponse.response)}`,
      )
      .digest('hex');
    id = `resp_h_${contentHash}_${turnSalt}_${partIdx}`;
  }

  if (contentHash) {
    PART_HASH_CACHE.set(obj, contentHash);
  }

  if (!id) {
    id = randomUUID();
  }

  nodeIdentityMap.set(obj, id);
  return id;
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
    const nodes: ConcreteNode[] = [];

    // Tracks occurrences of identical turn content to ensure unique stable IDs
    const seenHashes = new Map<string, number>();

    for (let turnIdx = 0; turnIdx < history.length; turnIdx++) {
      const msg = history[turnIdx];
      if (!msg.parts) continue;

      // Defensive: Skip legacy environment header regardless of where it appears.
      // We now manage this as an orthogonal late-addition header.
      if (msg.role === 'user' && msg.parts.length === 1) {
        const text = msg.parts[0].text;
        if (
          text?.startsWith('<session_context>') &&
          text?.includes('This is the Gemini CLI')
        ) {
          debugLogger.log(
            '[ContextGraphBuilder] Skipping legacy environment header turn from graph.',
          );
          continue;
        }
      }

      // Generate a stable salt for this turn based on its role and content
      const turnContent = JSON.stringify(msg.parts);
      const h = createHash('md5')
        .update(`${msg.role}:${turnContent}`)
        .digest('hex');
      const occurrence = (seenHashes.get(h) || 0) + 1;
      seenHashes.set(h, occurrence);
      const turnSalt = `${h}_${occurrence}`;
      const turnId = getStableId(msg, this.nodeIdentityMap, turnSalt, -1);

      if (msg.role === 'user') {
        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionResponsePart(part) &&
            typeof part.functionResponse.id === 'string'
              ? `resp_${part.functionResponse.id}_${turnSalt}_${partIdx}`
              : isFunctionCallPart(part) &&
                  typeof part.functionCall.id === 'string'
                ? `call_${part.functionCall.id}_${turnSalt}_${partIdx}`
                : undefined;
          const id =
            apiId || getStableId(part, this.nodeIdentityMap, turnSalt, partIdx);
          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: isFunctionResponsePart(part)
              ? NodeType.TOOL_EXECUTION
              : NodeType.USER_PROMPT,
            role: 'user',
            payload: part,
            turnId,
          };
          nodes.push(node);
        }
      } else if (msg.role === 'model') {
        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionCallPart(part) && typeof part.functionCall.id === 'string'
              ? `call_${part.functionCall.id}_${turnSalt}_${partIdx}`
              : undefined;
          const id =
            apiId || getStableId(part, this.nodeIdentityMap, turnSalt, partIdx);
          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: isFunctionCallPart(part)
              ? NodeType.TOOL_EXECUTION
              : NodeType.AGENT_THOUGHT,
            role: 'model',
            payload: part,
            turnId,
          };
          nodes.push(node);
        }
      }
    }

    debugLogger.log(
      `[ContextGraphBuilder] Mirror Graph built with ${nodes.length} nodes.`,
    );
    return nodes;
  }
}
