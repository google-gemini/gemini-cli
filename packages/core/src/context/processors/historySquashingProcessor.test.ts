/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistorySquashingProcessor } from './historySquashingProcessor.js';
import type { Config } from '../../config/config.js';
import type {
  Episode,
  UserPrompt,
  AgentThought,
  AgentYield,
} from '../ir/types.js';
import type { ContextAccountingState } from '../pipeline.js';
import { randomUUID } from 'node:crypto';

describe('HistorySquashingProcessor', () => {
  let mockConfig: Config;
  let processor: HistorySquashingProcessor;

  beforeEach(() => {
    mockConfig = {
      getContextManagementConfig: vi.fn().mockReturnValue({
        strategies: {
          historySquashing: { maxTokensPerNode: 100 }, // Extremely small limit for testing
        },
      }),
    } as unknown as Config;

    processor = new HistorySquashingProcessor(mockConfig);
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
    modelThought: string,
  ): Episode => ({
    id,
    timestamp: Date.now(),
    trigger: {
      id: randomUUID(),
      type: 'USER_PROMPT',
      semanticParts: [{ type: 'text', text: userText }],
      metadata: {
        originalTokens: 1000,
        currentTokens: 1000,
        transformations: [],
      },
    },
    steps: [
      {
        id: randomUUID(),
        type: 'AGENT_THOUGHT',
        text: modelThought,
        metadata: {
          originalTokens: 1000,
          currentTokens: 1000,
          transformations: [],
        },
      },
    ],
  });

  it('bypasses processing if budget is satisfied', async () => {
    const episodes = [createDummyEpisode('1', 'short text', 'short thought')];
    const state = getDummyState(true);

    const result = await processor.process(episodes, state);

    expect(result).toStrictEqual(episodes);
    expect(
      (result[0].trigger as UserPrompt).semanticParts[0].presentation,
    ).toBeUndefined();
  });

  it('skips protected episodes', async () => {
    // 500 chars = ~125 tokens. Limit is 100 tokens, so it WOULD truncate if not protected.
    const longText = 'A'.repeat(500);
    const episodes = [createDummyEpisode('ep-1', longText, 'short thought')];
    const state = getDummyState(false, 100, new Set(['ep-1']));

    const result = await processor.process(episodes, state);

    expect(
      (result[0].trigger as UserPrompt).semanticParts[0].presentation,
    ).toBeUndefined();
  });

  it('truncates both UserPrompts and AgentThoughts', async () => {
    const longUser = 'U'.repeat(1000); // ~250 tokens
    const longModel = 'M'.repeat(1000); // ~250 tokens
    const episodes = [createDummyEpisode('ep-2', longUser, longModel)];
    const state = getDummyState(false, 500, new Set()); // High deficit, force truncation

    const result = await processor.process(episodes, state);

    const userPart = (result[0].trigger as UserPrompt).semanticParts[0];
    const thoughtPart = result[0].steps[0] as AgentThought;

    expect(userPart.presentation).toBeDefined();
    expect(userPart.presentation!.text).toContain(
      '[... OMITTED 600 chars ...]',
    );

    expect(thoughtPart.presentation).toBeDefined();
    expect(thoughtPart.presentation!.text).toContain(
      '[... OMITTED 600 chars ...]',
    );

    // Check audit trails
    expect(result[0].trigger.metadata.transformations.length).toBe(1);
    expect(thoughtPart.metadata.transformations.length).toBe(1);
  });

  it('stops processing once deficit is resolved', async () => {
    const longUser1 = 'A'.repeat(1000);
    const longUser2 = 'B'.repeat(1000);
    const episodes = [
      createDummyEpisode('ep-3', longUser1, 'short'),
      createDummyEpisode('ep-4', longUser2, 'short'),
    ];

    // Set deficit to exactly what ONE truncation will save
    // Original = ~250 tokens. Limit = 100. Truncation saves ~150 tokens.
    const state = getDummyState(false, 150, new Set());

    const result = await processor.process(episodes, state);

    // First episode should be truncated
    const ep1Part = (result[0].trigger as UserPrompt).semanticParts[0];
    expect(ep1Part.presentation).toBeDefined();

    // Second episode should be untouched because the deficit hit 0
    const ep2Part = (result[1].trigger as UserPrompt).semanticParts[0];
    expect(ep2Part.presentation).toBeUndefined();
  });

  it('truncates IrNodes', async () => {
    const longYield = 'Y'.repeat(1000); // ~250 tokens
    const ep = createDummyEpisode('ep-5', 'short', 'short');
    ep.yield = {
      id: randomUUID(),
      type: 'AGENT_YIELD',
      text: longYield,
      metadata: {
        originalTokens: 250,
        currentTokens: 250,
        transformations: [],
      },
    };

    const state = getDummyState(false, 500, new Set());
    const result = await processor.process([ep], state);

    const yieldPart = result[0].yield as AgentYield;
    const yieldPresentation = yieldPart.presentation as { text: string };
    expect(yieldPresentation).toBeDefined();
    expect(yieldPresentation.text).toContain('[... OMITTED 600 chars ...]');
  });
});
