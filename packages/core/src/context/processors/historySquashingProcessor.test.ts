/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { HistorySquashingProcessor } from './historySquashingProcessor.js';
import {
  createMockEnvironment,
  createDummyState,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, AgentThought, AgentYield } from '../ir/types.js';
import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';

describe('HistorySquashingProcessor', () => {
  it('should truncate nodes that exceed maxTokensPerNode', async () => {
    const mockTokenCalculator = new ContextTokenCalculator(1) as any;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(10); // Limit is 10 chars

    mockTokenCalculator.estimateTokensForString = vi.fn((text: string) => {
        if (text.includes('OMITTED')) return 1; // Summary size
        return 100; // Original size
    });
    mockTokenCalculator.estimateTokensForParts = vi.fn(() => 1);

    const env = createMockEnvironment({
        tokenCalculator: mockTokenCalculator
    });

    const processor = HistorySquashingProcessor.create(env, {
      maxTokensPerNode: 1, // Will equal 10 chars limit
    });

    const state = createDummyState(false, 500); // 500 token deficit

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
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      state,
      inbox: {} as any,
    });

    expect(result.length).toBe(3);

    // 1. User Prompt
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe('mock-uuid-1');
    expect(squashedPrompt.id).not.toBe(prompt.id);
    expect(squashedPrompt.semanticParts[0].type).toBe('text');
    expect((squashedPrompt.semanticParts[0] as any).text).toContain('[... OMITTED');

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

  it('should stop truncating once the deficit is cleared', async () => {
    const mockTokenCalculator = new ContextTokenCalculator(1) as any;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(10); 
    mockTokenCalculator.estimateTokensForString = vi.fn((text: string) => {
        if (text.includes('OMITTED')) return 0; // Huge savings
        return 500; 
    });
    mockTokenCalculator.estimateTokensForParts = vi.fn(() => 0);

    const env = createMockEnvironment({
        tokenCalculator: mockTokenCalculator
    });

    const processor = HistorySquashingProcessor.create(env, {
      maxTokensPerNode: 1,
    });

    // Deficit is only 10 tokens. First truncation saves 500.
    const state = createDummyState(false, 10);

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 500, {
      semanticParts: [
        { type: 'text', text: 'This text is way longer than 10 characters and needs truncation' }
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 500, {
      text: 'The model is thinking something incredibly long and verbose that exceeds 10 chars',
    }, 'thought-id') as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      state,
      inbox: {} as any,
    });

    expect(result.length).toBe(2);

    // 1. User Prompt (truncated because deficit > 0)
    const squashedPrompt = result[0] as UserPrompt;
    expect(squashedPrompt.id).toBe('mock-uuid-1');
    expect(squashedPrompt.id).not.toBe(prompt.id);
    expect((squashedPrompt.semanticParts[0] as any).text).toContain('[... OMITTED');

    // 2. Agent Thought (untouched because deficit is now < 0)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id);
    expect(untouchedThought.text).not.toContain('[... OMITTED');
  });
});
