/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticCompressionProcessor } from './semanticCompressionProcessor.js';
import type { Config } from '../../config/config.js';
import type {
  Episode,
  UserPrompt,
  ToolExecution,
  AgentThought,
} from '../ir/types.js';
import type { ContextAccountingState } from '../pipeline.js';
import { randomUUID } from 'node:crypto';

describe('SemanticCompressionProcessor', () => {
  let mockConfig: Config;
  let processor: SemanticCompressionProcessor;
  let generateContentMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generateContentMock = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Mocked Summary!' }] } }],
    });

    mockConfig = {
      getContextManagementConfig: vi.fn().mockReturnValue({
        strategies: {
          semanticCompression: {
            nodeThresholdTokens: 10,
            compressionModel: 'test-model',
          },
        }, // Super small threshold
      }),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: generateContentMock,
      }),
    } as unknown as Config;

    processor = new SemanticCompressionProcessor(mockConfig);
  });

  const getDummyState = (
    isSatisfied = false,
    deficit = 0,
    protectedIds = new Set<string>(),
  ): ContextAccountingState => ({
    currentTokens: 5000,
    maxTokens: 10000,
    retainedTokens: 4000,
    deficitTokens: deficit,
    protectedEpisodeIds: protectedIds,
    isBudgetSatisfied: isSatisfied,
  });

  const createDummyEpisode = (
    id: string,
    userText: string,
    thoughtText: string,
    toolObs: string,
  ): Episode => ({
    id,
    timestamp: Date.now(),
    trigger: {
      id: randomUUID(),
      type: 'USER_PROMPT',
      semanticParts: [{ type: 'text', text: userText }],
      metadata: {
        originalTokens: 3800,
        currentTokens: 3800,
        transformations: [],
      },
    },
    steps: [
      {
        id: randomUUID(),
        type: 'AGENT_THOUGHT',
        text: thoughtText,
        metadata: {
          originalTokens: 100,
          currentTokens: 100,
          transformations: [],
        },
      },
      {
        id: randomUUID(),
        type: 'TOOL_EXECUTION',
        toolName: 'test',
        intent: {},
        observation: toolObs,
        tokens: { intent: 10, observation: 3800 },
        metadata: {
          originalTokens: 3810,
          currentTokens: 3810,
          transformations: [],
        },
      },
    ],
  });

  it('bypasses processing if budget is satisfied', async () => {
    const episodes = [createDummyEpisode('1', 'short', 'short', 'short')];
    const state = getDummyState(true);

    await processor.process(episodes, state);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('skips protected episodes even if over budget', async () => {
    const massiveStr = 'M'.repeat(15000); // Exceeds threshold (10 * 4 = 40)
    const episodes = [
      createDummyEpisode('ep-1', massiveStr, massiveStr, massiveStr),
    ];
    const state = getDummyState(false, 1000, new Set(['ep-1']));

    await processor.process(episodes, state);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('summarizes unprotected UserPrompts, Thoughts, and Tool observations until deficit is met', async () => {
    const massiveStr = 'M'.repeat(15000);
    const episodes = [
      createDummyEpisode('ep-1', massiveStr, massiveStr, massiveStr),
    ];
    const state = getDummyState(false, 50000, new Set()); // Massive deficit, forces all 3 to summarize

    const result = await processor.process(episodes, state);
    expect(generateContentMock).toHaveBeenCalledTimes(3);

    // Verify presentation layers were injected
    const userPart = (result[0].trigger as UserPrompt).semanticParts[0];
    const thoughtPart = result[0].steps[0] as AgentThought;
    const toolPart = result[0].steps[1] as ToolExecution;

    expect(userPart.presentation).toBeDefined();
    expect(userPart.presentation!.text).toContain('Mocked Summary!');

    expect(thoughtPart.presentation).toBeDefined();
    expect(thoughtPart.presentation!.text).toContain('Mocked Summary!');

    expect(toolPart.presentation).toBeDefined();
    expect(
      (toolPart.presentation!.observation as Record<string, string>)['summary'],
    ).toContain('Mocked Summary!');
  });

  it('stops calling LLM when deficit hits zero', async () => {
    const massiveStr = 'M'.repeat(15000);
    const episodes = [
      createDummyEpisode('ep-1', massiveStr, massiveStr, massiveStr),
    ];

    // Set deficit low enough that ONE summary solves the problem
    const state = getDummyState(false, 5, new Set());

    await processor.process(episodes, state);
    // It should only compress the UserPrompt and then stop
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});
