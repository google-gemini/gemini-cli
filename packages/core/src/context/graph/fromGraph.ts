/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ConcreteNode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Reconstructs a valid Gemini Chat History from a list of Concrete Nodes.
 * This process is "role-alternation-aware" and uses turnId to
 * preserve original turn boundaries even if multiple turns have the same role.
 */
export function fromGraph(nodes: readonly ConcreteNode[]): Content[] {
  debugLogger.log(
    `[fromGraph] Reconstructing history from ${nodes.length} nodes`,
  );

  const history: Content[] = [];
  let currentTurn: (Content & { _turnId?: string }) | null = null;

  for (const node of nodes) {
    const turnId = node.turnId;

    // We start a new turn if:
    // 1. We don't have a current turn.
    // 2. The role changes (Standard alternation).
    // 3. The turnId changes (Preserving distinct turns of the same role).
    if (
      !currentTurn ||
      currentTurn.role !== node.role ||
      currentTurn._turnId !== turnId
    ) {
      currentTurn = {
        role: node.role,
        parts: [node.payload],
        _turnId: turnId,
      };
      history.push(currentTurn);
    } else {
      currentTurn.parts = [...(currentTurn.parts || []), node.payload];
    }
  }

  // Final cleanup: remove our internal tracking field
  for (const turn of history) {
    const t = turn as Content & { _turnId?: string };
    delete t._turnId;
  }

  debugLogger.log(`[fromGraph] Reconstructed ${history.length} turns`);
  return history;
}
