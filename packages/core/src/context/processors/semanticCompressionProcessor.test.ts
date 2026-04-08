/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { SemanticCompressionProcessor } from './semanticCompressionProcessor.js';
import {
  createMockEnvironment,
  createDummyState,
  createDummyNode,
  createDummyToolNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, AgentThought, ToolExecution } from '../ir/types.js';
import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';

describe('SemanticCompressionProcessor', () => {
  it('should trigger summarization via LLM for long text parts', async () => {
    const mockLlmClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Mocked Summary!' }] } }],
      }),
    };

    const mockTokenCalculator = new ContextTokenCalculator(1) as any;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(10);
    mockTokenCalculator.estimateTokensForParts = vi.fn((parts: any) => {
       if (parts[0]?.text === 'Mocked Summary!') return 5;
       if (parts[0]?.functionResponse?.response?.summary === 'Mocked Summary!') return 10;
       return 5000;
    });

    const env = createMockEnvironment({
        llmClient: mockLlmClient as any,
        tokenCalculator: mockTokenCalculator
    });

    const processor = SemanticCompressionProcessor.create(env, {
      nodeThresholdTokens: 10,
    });

    const state = createDummyState(false, 15000); // We need to save tons of tokens

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 3800, {
      semanticParts: [
        { type: 'text', text: 'This text is way longer than 10 characters and needs compression' }
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 1500, {
      text: 'The model is thinking something incredibly long and verbose that exceeds 10 chars',
      metadata: { currentTokens: 5000, originalTokens: 5000, transformations: [] }
    }, 'thought-id') as AgentThought;

    const tool = createDummyToolNode('ep1', 50, 1000, {
      observation: { result: 'Massive tool JSON observation payload' },
      tokens: { intent: 50, observation: 1000 }
    }, 'tool-id');

    const targets = [prompt, thought, tool];

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      state,
      inbox: {} as any,
    });

    expect(result.length).toBe(3);

    // 1. User Prompt
    const compressedPrompt = result[0] as UserPrompt;
    expect(compressedPrompt.id).toBe('mock-uuid-1');
    expect(compressedPrompt.id).not.toBe(prompt.id);
    expect(compressedPrompt.semanticParts[0].type).toBe('text');
    expect((compressedPrompt.semanticParts[0] as any).text).toBe('Mocked Summary!');
    expect(compressedPrompt.metadata.transformations.length).toBe(1);
    expect(compressedPrompt.metadata.transformations[0].action).toBe('SUMMARIZED');

    // 2. Agent Thought
    const compressedThought = result[1] as AgentThought;
    expect(compressedThought.id).toBe('mock-uuid-2');
    expect(compressedThought.id).not.toBe(thought.id);
    expect(compressedThought.text).toBe('Mocked Summary!');
    expect(compressedThought.metadata.transformations.length).toBe(1);

    // 3. Tool Execution
    const compressedTool = result[2] as ToolExecution;
    expect(compressedTool.id).toBe('mock-uuid-3');
    expect(compressedTool.id).not.toBe(tool.id);
    expect(compressedTool.observation).toEqual({ summary: 'Mocked Summary!' });
    expect(compressedTool.metadata.transformations.length).toBe(1);

    // Verify LLM was called 3 times
    expect(mockLlmClient.generateContent).toHaveBeenCalledTimes(3);
  });

  it('should stop summarizing once the deficit is cleared', async () => {
    const mockLlmClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Mocked Summary!' }] } }],
      }),
    };

    const mockTokenCalculator = new ContextTokenCalculator(1) as any;
    mockTokenCalculator.tokensToChars = vi.fn().mockReturnValue(10);
    // Returning 0 tokens for the summary to maximize savings
    mockTokenCalculator.estimateTokensForParts = vi.fn((parts: any) => {
       if (parts[0]?.text === 'Mocked Summary!') return 0;
       return 5000;
    });

    const env = createMockEnvironment({
       llmClient: mockLlmClient as any,
       tokenCalculator: mockTokenCalculator
    });

    const processor = SemanticCompressionProcessor.create(env, {
      nodeThresholdTokens: 10,
    });

    // Deficit is only 10 tokens! The first summarization will save 5000 tokens, clearing it instantly.
    const state = createDummyState(false, 10); 

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 3800, {
      semanticParts: [
        { type: 'text', text: 'This text is way longer than 10 characters and needs compression' }
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 1500, {
      text: 'The model is thinking something incredibly long and verbose that exceeds 10 chars',
      metadata: { currentTokens: 5000, originalTokens: 5000, transformations: [] }
    }, 'thought-id') as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      state,
      inbox: {} as any,
    });

    expect(result.length).toBe(2);

    // 1. User Prompt (was summarized because deficit was > 0)
    const compressedPrompt = result[0] as UserPrompt;
    expect(compressedPrompt.id).toBe('mock-uuid-1');
    expect(compressedPrompt.id).not.toBe(prompt.id);

    // 2. Agent Thought (was NOT summarized because deficit hit 0)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id); // Reference equality!
    expect(untouchedThought.text).toBe(thought.text);

    // LLM should only have been called once
    expect(mockLlmClient.generateContent).toHaveBeenCalledTimes(1);
  });
});
