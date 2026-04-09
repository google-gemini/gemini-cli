/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { NodeDistillationProcessor } from './nodeDistillationProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
  createDummyToolNode,
  createMockGenerateContentResponse
} from '../testing/contextTestUtils.js';
import type { UserPrompt, AgentThought, ToolExecution } from '../ir/types.js';

describe('NodeDistillationProcessor', () => {
  it('should trigger summarization via LLM for long text parts', async () => {
    const mockLlmClient = {
      generateContent: vi.fn().mockResolvedValue(createMockGenerateContentResponse('Mocked Summary!')), // length = 15
    };

    const env = createMockEnvironment({
        llmClient: mockLlmClient as any,
    });

    const processor = NodeDistillationProcessor.create(env, {
      nodeThresholdTokens: 10,
    });


    const prompt = createDummyNode('ep1', 'USER_PROMPT', 3800, {
      semanticParts: [
        { type: 'text', text: 'This text is way longer than 10 characters and needs compression' }
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 1500, {
      text: 'The model is thinking something incredibly long and verbose that exceeds 10 chars',
    }, 'thought-id') as AgentThought;

    const tool = createDummyToolNode('ep1', 50, 1000, {
      observation: { result: 'Massive tool JSON observation payload' },
      tokens: { intent: 50, observation: 1000 }
    }, 'tool-id');

    const targets = [prompt, thought, tool];

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      inbox: {} as any,
    });

    expect(result.length).toBe(3);

    // 1. User Prompt
    const compressedPrompt = result[0] as UserPrompt;
    expect(compressedPrompt.id).not.toBe(prompt.id);
    expect(compressedPrompt.semanticParts[0].type).toBe('text');
    expect((compressedPrompt.semanticParts[0] as any).text).toBe('Mocked Summary!');
    // 2. Agent Thought
    const compressedThought = result[1] as AgentThought;
    expect(compressedThought.id).toMatch(/^mock-uuid-/);
    expect(compressedThought.id).not.toBe(thought.id);
    expect(compressedThought.text).toBe('Mocked Summary!');

    const compressedTool = result[2] as ToolExecution;
    expect(compressedTool.id).toMatch(/^mock-uuid-/);
    expect(compressedTool.id).not.toBe(tool.id);
    expect(compressedTool.observation).toEqual({ summary: 'Mocked Summary!' });

    expect(mockLlmClient.generateContent).toHaveBeenCalledTimes(3);
  });

  it('should ignore nodes that are below the threshold', async () => {
    const mockLlmClient = {
      generateContent: vi.fn().mockResolvedValue(createMockGenerateContentResponse('S')), // length = 1
    };

    const env = createMockEnvironment({
       llmClient: mockLlmClient as any,
    });

    const processor = NodeDistillationProcessor.create(env, {
      nodeThresholdTokens: 100, // Very high threshold
    });


    const prompt = createDummyNode('ep1', 'USER_PROMPT', 3800, {
      semanticParts: [
        { type: 'text', text: 'Short text' } // Below threshold
      ],
    }, 'prompt-id') as UserPrompt;

    const thought = createDummyNode('ep1', 'AGENT_THOUGHT', 1500, {
      text: 'Short thought', // Below threshold
    }, 'thought-id') as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets,
      inbox: {} as any,
    });

    expect(result.length).toBe(2);

    // 1. User Prompt (NOT compressed)
    const untouchedPrompt = result[0] as UserPrompt;
    expect(untouchedPrompt.id).toBe(prompt.id);

    // 2. Agent Thought (NOT compressed)
    const untouchedThought = result[1] as AgentThought;
    expect(untouchedThought.id).toBe(thought.id); 

    // LLM should not have been called
    expect(mockLlmClient.generateContent).toHaveBeenCalledTimes(0);
  });
});
