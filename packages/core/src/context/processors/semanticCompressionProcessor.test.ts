/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createMockEnvironment,
  createDummyState,
  createDummyEpisode,
} from '../testing/contextTestUtils.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticCompressionProcessor } from './semanticCompressionProcessor.js';
import { EpisodeEditor } from '../ir/episodeEditor.js';
import type { UserPrompt, ToolExecution, AgentThought } from '../ir/types.js';
import { randomUUID } from 'node:crypto';
import type { BaseLlmClient } from 'src/core/baseLlmClient.js';

describe('SemanticCompressionProcessor', () => {
  let processor: SemanticCompressionProcessor;
  let generateContentMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generateContentMock = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Mocked Summary!' }] } }],
    });

    const env = createMockEnvironment();
    // Re-mock llmClient properly
    vi.spyOn(env, 'llmClient', 'get').mockReturnValue({
      generateContent: generateContentMock,
    } as unknown as BaseLlmClient);

    processor = new SemanticCompressionProcessor(env, {
      nodeThresholdTokens: 2000,
    });
  });

  const createEpisodeWithThoughtsAndTools = (
    id: string,
    userText: string,
    thoughtText: string,
    toolObs: string,
  ) => {
    const ep = createDummyEpisode(id, 'USER_PROMPT', [
      { type: 'text', text: userText },
    ]);
    // We override metadata for threshold triggering
    ep.trigger.metadata.currentTokens = 3800;

    ep.steps = [
      {
        id: randomUUID(),
        type: 'AGENT_THOUGHT',
        text: thoughtText,
        metadata: {
          originalTokens: 3800,
          currentTokens: 3800,
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
    ];
    return ep;
  };

  it('bypasses processing if budget is satisfied', async () => {
    const episodes = [
      createEpisodeWithThoughtsAndTools('1', 'short', 'short', 'short'),
    ];
    const state = createDummyState(true);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);

    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('skips protected episodes even if over budget', async () => {
    const massiveStr = 'M'.repeat(15000);
    const episodes = [
      createEpisodeWithThoughtsAndTools(
        'ep-1',
        massiveStr,
        massiveStr,
        massiveStr,
      ),
    ];
    const state = createDummyState(false, 1000, new Set(['ep-1']));

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);

    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('summarizes unprotected UserPrompts, Thoughts, and Tool observations until deficit is met', async () => {
    const massiveStr = 'M'.repeat(15000);
    const episodes = [
      createEpisodeWithThoughtsAndTools(
        'ep-1',
        massiveStr,
        massiveStr,
        massiveStr,
      ),
    ];
    const state = createDummyState(false, 50000); // Massive deficit, forces all 3 to summarize

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);

    expect(generateContentMock).toHaveBeenCalledTimes(3);

    // Verify presentation layers were injected
    const result = editor.getFinalEpisodes();
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
      createEpisodeWithThoughtsAndTools(
        'ep-1',
        massiveStr,
        massiveStr,
        massiveStr,
      ),
    ];

    // Set deficit low enough that ONE summary solves the problem
    const state = createDummyState(false, 5);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);

    // It should only compress the UserPrompt and then stop
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});
