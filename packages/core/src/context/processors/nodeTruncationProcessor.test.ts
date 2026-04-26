/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { describe, it, expect } from 'vitest';
import { createNodeTruncationProcessor } from './nodeTruncationProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, AgentThought, AgentYield } from '../graph/types.js';

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
      'USER_PROMPT',
      50,
      {
        semanticParts: [{ type: 'text', text: longText }],
      },
      'prompt-id',
    ) as UserPrompt;

    const thought = createDummyNode(
      'ep1',
      'AGENT_THOUGHT',
      50,
      {
        text: longText,
      },
      'thought-id',
    ) as AgentThought;

    const yieldNode = createDummyNode(
      'ep1',
      'AGENT_YIELD',
      50,
      {
        text: longText,
      },
      'yield-id',
    ) as AgentYield;

    const targets = [prompt, thought, yieldNode];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(3);

    // 1. User Prompt
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).not.toBe(prompt.id);
    expect(squashedPrompt.semanticParts[0].type).toBe('text');
    assert(squashedPrompt.semanticParts[0].type === 'text');
    expect(squashedPrompt.semanticParts[0].text).toContain('[... OMITTED');

    // 2. Agent Thought
    const squashedThought = result[1] as AgentThought;
    expect(squashedThought.id).not.toBe(thought.id);
    expect(squashedThought.text).toContain('[... OMITTED');

    // 3. Agent Yield
    const squashedYield = result[2] as AgentYield;
    expect(squashedYield.id).not.toBe(yieldNode.id);
    expect(squashedYield.text).toContain('[... OMITTED');
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
      'USER_PROMPT',
      10,
      {
        semanticParts: [{ type: 'text', text: shortText }],
      },
      'prompt-id',
    ) as UserPrompt;

    const thought = createDummyNode(
      'ep1',
      'AGENT_THOUGHT',
      13,
      {
        text: 'Short thought', // 13 chars
      },
      'thought-id',
    ) as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(2);

    // 1. User Prompt (untouched)
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe(prompt.id);
    assert(squashedPrompt.semanticParts[0].type === 'text');
    expect(squashedPrompt.semanticParts[0].text).not.toContain('[... OMITTED');

    // 2. Agent Thought (untouched)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id);
    expect(untouchedThought.text).not.toContain('[... OMITTED');
  });
});
