/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createMockEnvironment, createDummyState, createDummyEpisode } from '../testing/contextTestUtils.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmergencyTruncationProcessor } from './emergencyTruncationProcessor.js';
import { EpisodeEditor } from '../ir/episodeEditor.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

describe('EmergencyTruncationProcessor', () => {
  let processor: EmergencyTruncationProcessor;
  let env: ContextEnvironment;

  beforeEach(() => {
    vi.resetAllMocks();
    env = createMockEnvironment();
    // Force token calculator to return exactly what we tell it for deterministic testing
    vi.spyOn(env.tokenCalculator, 'calculateEpisodeListTokens').mockImplementation((episodes) => {
        // Just sum up the metadata originalTokens for our dummy episodes
        return episodes.reduce((acc, ep) => acc + (ep.trigger.metadata.originalTokens || 100), 0);
    });

    processor = new EmergencyTruncationProcessor(env, {});
  });

  it('bypasses processing if currentTokens <= maxTokens', async () => {
    const episodes = [
      createDummyEpisode('ep-1', 'USER_PROMPT', [{ text: 'short' }])
    ];
    // State says we are under budget (5000 < 10000)
    const state = createDummyState(true, 0, new Set(), 5000, 10000); 

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    expect(result).toStrictEqual(episodes);
    expect(result.length).toBe(1);
  });

  it('truncates episodes from the front (oldest) until targetTokens is met', async () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [{ text: 'oldest' }]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [{ text: 'middle' }]);
    const ep3 = createDummyEpisode('ep-3', 'USER_PROMPT', [{ text: 'newest' }]);
    
    // Each is worth 100 tokens according to our mock
    const episodes = [ep1, ep2, ep3];
    
    // We have 300 tokens, but max is 200. We need to drop 100 tokens.
    const state = createDummyState(false, 100, new Set(), 300, 200);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    
    // It should drop the FIRST episode (ep-1) and keep the rest.
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('ep-2');
    expect(result[1].id).toBe('ep-3');
  });

  it('never drops protected episodes (e.g. system instructions)', async () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [{ text: 'protected system prompt' }]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [{ text: 'middle' }]);
    const ep3 = createDummyEpisode('ep-3', 'USER_PROMPT', [{ text: 'newest' }]);
    
    const episodes = [ep1, ep2, ep3];
    
    // We have 300 tokens, max is 200. We need to drop 100 tokens.
    // However, ep-1 is protected!
    const state = createDummyState(false, 100, new Set(['ep-1']), 300, 200);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    
    // It should SKIP dropping ep-1 (protected) and drop ep-2 instead.
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('ep-1'); // Protected, survived
    expect(result[1].id).toBe('ep-3'); // Survivor
  });

  it('can drop multiple episodes if deficit is huge', async () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', []);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', []);
    const ep3 = createDummyEpisode('ep-3', 'USER_PROMPT', []);
    
    const episodes = [ep1, ep2, ep3];
    
    // We have 300 tokens, max is 50. We need to drop 250 tokens!
    const state = createDummyState(false, 250, new Set(), 300, 50);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    
    // It must drop ep1 (100t) and ep2 (100t). 
    // Remaining is ep3 (100t). 
    // Wait, if it drops ep1 (remaining=200) and ep2 (remaining=100), 
    // when it looks at ep3, remaining (100) > max (50), so it will drop ep3 too!
    expect(result.length).toBe(0);
  });
});
