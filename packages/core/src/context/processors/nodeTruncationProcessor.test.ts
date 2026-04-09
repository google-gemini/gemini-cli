/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { NodeTruncationProcessor } from './nodeTruncationProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, AgentThought, AgentYield } from '../ir/types.js';
import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';

describe('NodeTruncationProcessor', () => {
  it('should truncate nodes that exceed maxTokensPerNode', async () => {
    const env = createMockEnvironment();
    const mockTokenCalculator = new ContextTokenCalculator(1, env.behaviorRegistry) as unknown as import("../pipeline.js").ContextWorkingBuffer;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(10); // Limit is 10 chars

    mockTokenCalculator.estimateTokensForString = vi.fn((text: string) => {
        if (text.includes('OMITTED')) return 1; // Summary size
        return 100; // Original size
    });
    mockTokenCalculator.estimateTokensForParts = vi.fn(() => 1);

    (env as unknown as import("../pipeline.js").ContextWorkingBuffer).tokenCalculator = mockTokenCalculator;

    const processor = NodeTruncationProcessor.create(env, {
      maxTokensPerNode: 1, // Will equal 10 chars limit
    });


    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: [
        { type: 'text', text: 'This text is way longer than 10 characters and needs truncation' }
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 100, {
      text: 'The model is thinking something incredibly long and verbose that exceeds 10 chars',
    }, 'thought-id') as AgentThought;

    const yieldNode = createDummyNode('ep1', 'AGENT_YIELD', 100, {
      text: 'Final output yield that is also extremely long',
    }, 'yield-id') as AgentYield;

    const targets = [prompt, thought, yieldNode];

    const result = await processor.process({
      buffer: undefined as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      inbox: undefined as unknown as import('../pipeline.js').ContextWorkingBuffer,
    });

    expect(result.length).toBe(3);

    // 1. User Prompt
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe('mock-uuid-1');
    expect(squashedPrompt.id).not.toBe(prompt.id);
    expect(squashedPrompt.semanticParts[0].type).toBe('text');
    expect((squashedPrompt.semanticParts[0] as unknown as import("../pipeline.js").ContextWorkingBuffer).text).toContain('[... OMITTED');

    // 2. Agent Thought
    const squashedThought = result[1] as AgentThought;
    expect(squashedThought.id).toBe('mock-uuid-2');
    expect(squashedThought.id).not.toBe(thought.id);
    expect(squashedThought.text).toContain('[... OMITTED');

    // 3. Agent Yield
    const squashedYield = result[2] as AgentYield;
    expect(squashedYield.id).toBe('mock-uuid-3');
    expect(squashedYield.id).not.toBe(yieldNode.id);
    expect(squashedYield.text).toContain('[... OMITTED');
  });

  it('should ignore nodes that are below maxTokensPerNode', async () => {
    const env = createMockEnvironment();
    const mockTokenCalculator = new ContextTokenCalculator(1, env.behaviorRegistry) as unknown as import("../pipeline.js").ContextWorkingBuffer;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(100); 

    mockTokenCalculator.estimateTokensForString = vi.fn((text: string) => text.length);
    mockTokenCalculator.estimateTokensForParts = vi.fn(() => 5);
    mockTokenCalculator.getTokenCost = vi.fn(() => 5);

    (env as unknown as import("../pipeline.js").ContextWorkingBuffer).tokenCalculator = mockTokenCalculator;

    const processor = NodeTruncationProcessor.create(env, {
      maxTokensPerNode: 100,
    });


    const prompt = createDummyNode('ep1', 'USER_PROMPT', 5, {
      semanticParts: [
        { type: 'text', text: 'Short text' } // 10 chars
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 5, {
      text: 'Short thought', // 13 chars
    }, 'thought-id') as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process({
      buffer: undefined as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      inbox: undefined as unknown as import('../pipeline.js').ContextWorkingBuffer,
    });

    expect(result.length).toBe(2);

    // 1. User Prompt (untouched)
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe(prompt.id);
    expect((squashedPrompt.semanticParts[0] as unknown as import("../pipeline.js").ContextWorkingBuffer).text).not.toContain('[... OMITTED');

    // 2. Agent Thought (untouched)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id);
    expect(untouchedThought.text).not.toContain('[... OMITTED');
  });
});
