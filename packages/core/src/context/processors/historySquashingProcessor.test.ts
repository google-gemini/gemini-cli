/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createMockEnvironment, createDummyState, createDummyEpisode } from '../testing/contextTestUtils.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { HistorySquashingProcessor } from './historySquashingProcessor.js';
import type {
  UserPrompt,
  AgentThought,
  AgentYield,
} from '../ir/types.js';
import { randomUUID } from 'node:crypto';

describe('HistorySquashingProcessor', () => {
  let processor: HistorySquashingProcessor;

  beforeEach(() => {
    processor = new HistorySquashingProcessor(createMockEnvironment(), {
      maxTokensPerNode: 100,
    });
  });

  const createThoughtEpisode = (id: string, userText: string, modelThought: string) => {
    const ep = createDummyEpisode(id, 'USER_PROMPT', [{ type: 'text', text: userText }]);
    // Replace the tool steps with a thought step for this test
    ep.steps = [
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
    ];
    return ep;
  };

  it('bypasses processing if budget is satisfied', async () => {
    const episodes = [createThoughtEpisode('1', 'short text', 'short thought')];
    const state = createDummyState(true);

    const result = await processor.process(episodes, state);

    expect(result).toStrictEqual(episodes);
    expect(
      (result[0].trigger as UserPrompt).semanticParts[0].presentation,
    ).toBeUndefined();
  });

  it('skips protected episodes', async () => {
    // 500 chars = ~125 tokens. Limit is 100 tokens, so it WOULD truncate if not protected.
    const longText = 'A'.repeat(500);
    const episodes = [createThoughtEpisode('ep-1', longText, 'short thought')];
    const state = createDummyState(false, 100, new Set(['ep-1']));

    const result = await processor.process(episodes, state);

    expect(
      (result[0].trigger as UserPrompt).semanticParts[0].presentation,
    ).toBeUndefined();
  });

  it('truncates both UserPrompts and AgentThoughts', async () => {
    const longUser = 'U'.repeat(1000); // ~250 tokens
    const longModel = 'M'.repeat(1000); // ~250 tokens
    const episodes = [createThoughtEpisode('ep-2', longUser, longModel)];
    const state = createDummyState(false, 500); // High deficit, force truncation

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
      createThoughtEpisode('ep-3', longUser1, 'short'),
      createThoughtEpisode('ep-4', longUser2, 'short'),
    ];

    // Set deficit to exactly what ONE truncation will save
    // Original = ~250 tokens. Limit = 100. Truncation saves ~150 tokens.
    const state = createDummyState(false, 150);

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
    const ep = createThoughtEpisode('ep-5', 'short', 'short');
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

    const state = createDummyState(false, 500);
    const result = await processor.process([ep], state);

    const yieldPart = result[0].yield as AgentYield;
    const yieldPresentation = yieldPart.presentation as { text: string };
    expect(yieldPresentation).toBeDefined();
    expect(yieldPresentation.text).toContain('[... OMITTED 600 chars ...]');
  });
});
