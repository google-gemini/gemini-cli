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
 * This is a lossless process that preserves the original Part objects.
 */
export function fromGraph(nodes: readonly ConcreteNode[]): Content[] {
  debugLogger.log(`[fromGraph] Flattening ${nodes.length} nodes`);

  const history: Content[] = [];
  let currentTurn: Content | null = null;

  for (const node of nodes) {
    if (!currentTurn || currentTurn.role !== node.role) {
      currentTurn = { role: node.role, parts: [node.payload] };
      history.push(currentTurn);
    } else {
      currentTurn.parts = [...(currentTurn.parts || []), node.payload];
    }
  }

  debugLogger.log(`[fromGraph] Reconstructed ${history.length} turns`);
  return history;
}
