/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createNodeTruncationProcessor } from './nodeTruncationProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import {
  NodeType,
  type UserPrompt,
  type AgentThought,
  type AgentYield,
} from '../graph/types.js';

describe('NodeTruncationProcessor', () => {
  it('should truncate nodes that exceed maxTokensPerNode', async () => {
    // env.tokenCalculator uses charsPerToken=1 natively.
    const env = createMockEnvironment();

    const processor = createNodeTruncationProcessor(
      'NodeTruncationProcessor',
      env,
      {
        maxTokensPerNode: 10, // 10 chars limit
      },
    );

    const longText = 'A'.repeat(50); // 50 tokens

    const prompt = createDummyNode(
      'ep1',
      NodeType.USER_PROMPT,
      50,
      {
        payload: { text: longText },
      },
      'prompt-id',
    ) as UserPrompt;

    const thought = createDummyNode(
      'ep1',
      NodeType.AGENT_THOUGHT,
      50,
      {
        payload: { text: longText },
      },
      'thought-id',
    ) as AgentThought;

    const yieldNode = createDummyNode(
      'ep1',
      NodeType.AGENT_YIELD,
      50,
      {
        payload: { text: longText },
      },
      'yield-id',
    ) as AgentYield;

    const targets = [prompt, thought, yieldNode];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(3);

    // 1. User Prompt
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).not.toBe(prompt.id);
    expect(squashedPrompt.payload.text).toContain('[... OMITTED');

    // 2. Agent Thought
    const squashedThought = result[1] as AgentThought;
    expect(squashedThought.id).not.toBe(thought.id);
    expect(squashedThought.payload.text).toContain('[... OMITTED');

    // 3. Agent Yield
    const squashedYield = result[2] as AgentYield;
    expect(squashedYield.id).not.toBe(yieldNode.id);
    expect(squashedYield.payload.text).toContain('[... OMITTED');
  });

  it('should ignore nodes that are below maxTokensPerNode', async () => {
    const env = createMockEnvironment();

    const processor = createNodeTruncationProcessor(
      'NodeTruncationProcessor',
      env,
      {
        maxTokensPerNode: 100, // 100 chars limit
      },
    );

    const shortText = 'Short text'; // 10 chars

    const prompt = createDummyNode(
      'ep1',
      NodeType.USER_PROMPT,
      10,
      {
        payload: { text: shortText },
      },
      'prompt-id',
    ) as UserPrompt;

    const thought = createDummyNode(
      'ep1',
      NodeType.AGENT_THOUGHT,
      13,
      {
        payload: { text: 'Short thought' }, // 13 chars
      },
      'thought-id',
    ) as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(2);

    // 1. User Prompt (untouched)
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe(prompt.id);
    expect(squashedPrompt.payload.text).not.toContain('[... OMITTED');

    // 2. Agent Thought (untouched)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id);
    expect(untouchedThought.payload.text).not.toContain('[... OMITTED');
  });
});
