/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ContextTokenCalculator } from './contextTokenCalculator.js';
import { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';
import { registerBuiltInBehaviors } from '../graph/builtinBehaviors.js';
import { createDummyNode } from '../testing/contextTestUtils.js';
import { MSG_OVERHEAD_TOKENS } from '../../utils/tokenCalculation.js';
import { NodeType } from '../graph/types.js';

describe('ContextTokenCalculator', () => {
  const registry = new NodeBehaviorRegistry();
  registerBuiltInBehaviors(registry);
  const charsPerToken = 1; // Simplifies math for text nodes in tests
  const calculator = new ContextTokenCalculator(charsPerToken, registry);

  it('should include structural overhead for each unique turn', () => {
    const turn1Id = 'turn-1';
    const turn2Id = 'turn-2';

    const node1 = createDummyNode(turn1Id, NodeType.USER_PROMPT);
    const node2 = createDummyNode(turn1Id, NodeType.USER_PROMPT); // Same turn
    const node3 = createDummyNode(turn2Id, NodeType.AGENT_THOUGHT); // Different turn

    const nodes = [node1, node2, node3];

    // Estimated tokens (using 0.33 per ASCII char heuristic):
    // node1: floor(17 chars * 0.33) = 5 tokens
    // node2: floor(17 chars * 0.33) = 5 tokens
    // node3: floor(19 chars * 0.33) = 6 tokens
    // Turn 1 overhead: 5 tokens
    // Turn 2 overhead: 5 tokens
    // Total: 5 + 5 + 6 + 5 + 5 = 26

    const total = calculator.calculateConcreteListTokens(nodes);
    expect(total).toBe(26);
  });

  it('should handle categorical breakdown with overhead', () => {
    const turn1Id = 'turn-1';
    const node = createDummyNode(turn1Id, NodeType.USER_PROMPT);

    const breakdown = calculator.calculateTokenBreakdown([node]);

    expect(breakdown.overhead).toBe(MSG_OVERHEAD_TOKENS);
    expect(breakdown.total).toBe(
      calculator.getTokenCost(node) + MSG_OVERHEAD_TOKENS,
    );
  });

  it('should not double-count overhead for duplicate turn IDs in separate nodes', () => {
    const turn1Id = 'turn-1';
    const node1 = createDummyNode(turn1Id, NodeType.USER_PROMPT);
    const node2 = createDummyNode(turn1Id, NodeType.USER_PROMPT);

    const total = calculator.calculateConcreteListTokens([node1, node2]);

    // cost(node1) + cost(node2) + 1 * overhead
    const expected =
      calculator.getTokenCost(node1) +
      calculator.getTokenCost(node2) +
      MSG_OVERHEAD_TOKENS;
    expect(total).toBe(expected);
  });
});
