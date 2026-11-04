/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { NodeIdService } from './nodeIdService.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';

/**
 * Reconstructs a list of HistoryTurns from a list of Concrete Nodes.
 * This process is "role-alternation-aware" and uses turnId to
 * preserve original turn boundaries and IDs.
 */
export function fromGraph(
  nodes: readonly ConcreteNode[],
  idService?: NodeIdService,
): HistoryTurn[] {
  debugLogger.log(
    `[fromGraph] Reconstructing history from ${nodes.length} nodes`,
  );

  const history: HistoryTurn[] = [];
  let currentTurn: { id: string; content: Content } | null = null;

  for (const node of nodes) {
    const turnId = node.turnId || 'orphan';
    const durableId = turnId.startsWith('turn_') ? turnId.slice(5) : turnId;

    // Register the payload in the identity service to ensure stability
    // even if the turn content changes (e.g. after GC backstop).
    if (idService) {
      idService.set(node.payload, node.id);
    }

    // We start a new turn if:
    // 1. We don't have a current turn.
    // 2. The role changes (Standard alternation).
    // 3. The turnId changes (Preserving distinct turns of the same role).
    if (
      !currentTurn ||
      currentTurn.content.role !== node.role ||
      currentTurn.id !== durableId
    ) {
      currentTurn = {
        id: durableId,
        content: {
          role: node.role,
          parts: [node.payload],
        },
      };
      history.push(currentTurn);
    } else {
      currentTurn.content.parts = [
        ...(currentTurn.content.parts || []),
        node.payload,
      ];
    }
  }

  debugLogger.log(`[fromGraph] Reconstructed ${history.length} turns`);
  return history;
}
