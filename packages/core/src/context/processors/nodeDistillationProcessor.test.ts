/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createNodeDistillationProcessor } from './nodeDistillationProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
  createDummyToolNode,
  createMockLlmClient,
} from '../testing/contextTestUtils.js';
import { NodeType } from '../graph/types.js';
import type {
  UserPrompt,
  AgentThought,
  ToolExecution,
} from '../graph/types.js';

describe('NodeDistillationProcessor', () => {
  it('should trigger summarization via LLM for long text parts', async () => {
    const mockLlmClient = createMockLlmClient(['Mocked Summary!']);

    // Use charsPerToken=1 naturally.
    const env = createMockEnvironment({
      llmClient: mockLlmClient,
    });

    const processor = createNodeDistillationProcessor(
      'NodeDistillationProcessor',
      env,
      {
        nodeThresholdTokens: 10,
      },
    );

    const longText = 'A'.repeat(50); // 50 chars

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

    const tool = createDummyToolNode(
      'ep1',
      5,
      500,
      {
        role: 'user',
        payload: {
          functionResponse: {
            name: 'dummy_tool',
            response: { result: 'A'.repeat(500) },
          },
        },
      },
      'tool-id',
    );

    const targets = [prompt, thought, tool];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(3);

    // 1. User Prompt
    const compressedPrompt = result[0] as UserPrompt;
    expect(compressedPrompt.id).not.toBe(prompt.id);
    expect(compressedPrompt.payload.text).toBe('Mocked Summary!');

    // 2. Agent Thought
    const compressedThought = result[1] as AgentThought;
    expect(compressedThought.id).not.toBe(thought.id);
    expect(compressedThought.payload.text).toBe('Mocked Summary!');

    // 3. Tool Execution
    const compressedTool = result[2] as ToolExecution;
    expect(compressedTool.id).not.toBe(tool.id);
    expect(compressedTool.payload.functionResponse?.response).toEqual({
      summary: 'Mocked Summary!',
    });

    expect(mockLlmClient.generateContent).toHaveBeenCalledTimes(3);
  });

  it('should ignore nodes that are below the threshold', async () => {
    const mockLlmClient = createMockLlmClient(['S']); // length = 1

    const env = createMockEnvironment({
      llmClient: mockLlmClient,
    });

    const processor = createNodeDistillationProcessor(
      'NodeDistillationProcessor',
      env,
      {
        nodeThresholdTokens: 100, // Very high threshold
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
        payload: { text: 'Short thought' },
      },
      'thought-id',
    ) as AgentThought;

    const targets = [prompt, thought];

    const result = await processor.process(createMockProcessArgs(targets));

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
