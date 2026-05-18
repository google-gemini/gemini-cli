/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { type ConcreteNode, NodeType } from './types.js';
import { createHash } from 'node:crypto';
import { debugLogger } from '../../utils/debugLogger.js';
import type { NodeIdService } from './nodeIdService.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';
import { isSnapshotState } from '../utils/snapshotGenerator.js';

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

function isExecutableCodePart(
  part: Part,
): part is Part & { executableCode: { code: string; language: string } } {
  return (
    typeof part.executableCode === 'object' &&
    part.executableCode !== null &&
    typeof part.executableCode.code === 'string' &&
    typeof part.executableCode.language === 'string'
  );
}

function isCodeExecutionResultPart(
  part: Part,
): part is Part & { codeExecutionResult: { outcome: string; output: string } } {
  return (
    typeof part.codeExecutionResult === 'object' &&
    part.codeExecutionResult !== null &&
    typeof part.codeExecutionResult.output === 'string' &&
    typeof part.codeExecutionResult.outcome === 'string'
  );
}

/**
 * Generates a stable ID for an object reference using a NodeIdService.
 * Falls back to content-based hashing for Part-like objects to ensure
 * stability across object re-creations (e.g. during history mapping).
 */
export function getStableId(
  obj: object,
  idService: NodeIdService,
  turnSalt: string = '',
  partIdx: number = 0,
): string {
  let id = idService.get(obj);
  if (id) return id;

  const cachedHash = PART_HASH_CACHE.get(obj);
  if (cachedHash) {
    id = `${cachedHash}_${turnSalt}_${partIdx}`;
    idService.set(obj, id);
    return id;
  }

  const part = obj as Part;
  let contentHash: string | undefined;

  if (isTextPart(part)) {
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
  } else if (isExecutableCodePart(part)) {
    contentHash = createHash('sha256')
      .update(
        `exec:${part.executableCode.language}:${part.executableCode.code}`,
      )
      .digest('hex');
    id = `exec_${contentHash}_${turnSalt}_${partIdx}`;
  } else if (isCodeExecutionResultPart(part)) {
    contentHash = createHash('sha256')
      .update(
        `result:${part.codeExecutionResult.outcome}:${part.codeExecutionResult.output}`,
      )
      .digest('hex');
    id = `result_${contentHash}_${turnSalt}_${partIdx}`;
  }

  if (contentHash) {
    PART_HASH_CACHE.set(obj, contentHash);
  }

  if (!id) {
    if (turnSalt && partIdx === -1) {
      id = `turn_${turnSalt}`;
    } else {
      id = `${turnSalt}_f_${partIdx}`;
    }
  }

  idService.set(obj, id);
  return id;
}

/**
 * Builds a 1:1 Mirror Graph from Chat History.
 * Every Part in history is mapped to exactly one ConcreteNode.
 */
export class ContextGraphBuilder {
  constructor(private readonly idService: NodeIdService) {}

  processHistory(history: readonly HistoryTurn[]): ConcreteNode[] {
    const nodes: ConcreteNode[] = [];

    for (let turnIdx = 0; turnIdx < history.length; turnIdx++) {
      const turn = history[turnIdx];
      const msg = turn.content;
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

      const turnSalt = turn.id;
      const turnId = `turn_${turnSalt}`;

      if (msg.role === 'user') {
        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionResponsePart(part) &&
            typeof part.functionResponse.id === 'string'
              ? part.functionResponse.id
              : isFunctionCallPart(part) &&
                  typeof part.functionCall.id === 'string'
                ? part.functionCall.id
                : undefined;

          const isSnapshot = isTextPart(part) && isSnapshotState(part.text);

          // Use stable API ID if available, otherwise anchor to the turn and index.
          const id = apiId
            ? `${apiId}_${turnSalt}_${partIdx}`
            : `${turnSalt}_${partIdx}`;

          const node: ConcreteNode = {
            id,
            timestamp: Date.now(),
            type: isFunctionResponsePart(part)
              ? NodeType.TOOL_EXECUTION
              : isSnapshot
                ? NodeType.SNAPSHOT
                : NodeType.USER_PROMPT,
            role: 'user',
            payload: part,
            turnId,
          };
          nodes.push(node);
          this.idService.set(part, id);
        }
      } else if (msg.role === 'model') {
        for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
          const part = msg.parts[partIdx];
          const apiId =
            isFunctionCallPart(part) && typeof part.functionCall.id === 'string'
              ? part.functionCall.id
              : undefined;

          const id = apiId
            ? `${apiId}_${turnSalt}_${partIdx}`
            : `${turnSalt}_${partIdx}`;

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
          this.idService.set(part, id);
        }
      }
    }

    debugLogger.log(
      `[ContextGraphBuilder] Mirror Graph built with ${nodes.length} nodes.`,
    );
    return nodes;
  }
}
