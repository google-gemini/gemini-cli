/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../graph/types.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Validates structural and logical invariants of the Episodic Context Graph.
 * Primarily used in debug mode to identify "smelly" states before they reach the LLM.
 */
export function checkContextInvariants(
  nodes: readonly ConcreteNode[],
  context: string,
): void {
  const seenIds = new Set<string>();
  const duplicates = new Set<string>();

  for (const node of nodes) {
    if (seenIds.has(node.id)) {
      duplicates.add(node.id);
    }
    seenIds.add(node.id);
  }

  if (duplicates.size > 0) {
    debugLogger.warn(
      `[InvariantCheck][${context}] Detected ${duplicates.size} duplicate nodes by ID: ${Array.from(duplicates).join(', ')}`,
    );
  }

  // Check for orphan logic (nodes without turn association)
  const orphans = nodes.filter((n) => !n.turnId);
  if (orphans.length > 0) {
    debugLogger.warn(
      `[InvariantCheck][${context}] Detected ${orphans.length} nodes without turnId.`,
    );
  }

  // Check for timestamp linearity
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].timestamp < nodes[i - 1].timestamp) {
      debugLogger.warn(
        `[InvariantCheck][${context}] Non-linear timestamps detected at index ${i}.`,
      );
      break;
    }
  }
}
