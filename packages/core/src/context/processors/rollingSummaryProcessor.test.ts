/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { createRollingSummaryProcessor } from './rollingSummaryProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';

describe('RollingSummaryProcessor', () => {
  it('should initialize with correct default options', () => {
    const env = createMockEnvironment();
    const processor = createRollingSummaryProcessor(
      'RollingSummaryProcessor',
      env,
      {
        target: 'incremental',
      },
    );
    expect(processor.id).toBe('RollingSummaryProcessor');
  });

  it('should summarize older nodes when the deficit exceeds the threshold', async () => {
    // env.tokenCalculator uses charsPerToken=1 based on createMockEnvironment
    const env = createMockEnvironment();

    // We want to free exactly 100 tokens.
    // We will supply nodes that cost 50 tokens each.
    const processor = createRollingSummaryProcessor(
      'RollingSummaryProcessor',
      env,
      {
        target: 'freeNTokens',
        freeTokensTarget: 100,
      },
    );

    const text50 = 'A'.repeat(50);
    const targets = [
      createDummyNode(
        'ep1',
        'USER_PROMPT',
        50,
        { semanticParts: [{ type: 'text', text: text50 }] },
        'id1',
      ),
      createDummyNode('ep1', 'AGENT_THOUGHT', 50, { text: text50 }, 'id2'),
      createDummyNode('ep1', 'AGENT_YIELD', 50, { text: text50 }, 'id3'),
    ];

    const result = await processor.process(createMockProcessArgs(targets));

    // 3 nodes at 50 cost each.
    // The first node (id1) is the initial USER_PROMPT and is always skipped by RollingSummaryProcessor.
    // Node id2 adds 50 deficit. Node id3 adds 50 deficit. Total = 100 deficit, which hits the target break point.
    // Thus, id2 and id3 are summarized into a new ROLLING_SUMMARY node.
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('USER_PROMPT');
    expect(result[1].type).toBe('ROLLING_SUMMARY');
  });

  it('should preserve targets if deficit does not trigger summary', async () => {
    const env = createMockEnvironment();

    // We want to free 100 tokens, but our nodes will only cost 10 tokens each.
    const processor = createRollingSummaryProcessor(
      'RollingSummaryProcessor',
      env,
      {
        target: 'freeNTokens',
        freeTokensTarget: 100,
      },
    );

    const text10 = 'A'.repeat(10);
    const targets = [
      createDummyNode(
        'ep1',
        'USER_PROMPT',
        10,
        { semanticParts: [{ type: 'text', text: text10 }] },
        'id1',
      ),
      createDummyNode('ep1', 'AGENT_THOUGHT', 10, { text: text10 }, 'id2'),
    ];

    const result = await processor.process(createMockProcessArgs(targets));

    // Deficit accumulator reaches 10. This is < 100 limit, and total summarizable nodes < 2 anyway.
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('USER_PROMPT');
    expect(result[1].type).toBe('AGENT_THOUGHT');
  });
});
