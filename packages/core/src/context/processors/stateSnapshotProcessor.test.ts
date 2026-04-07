/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createMockEnvironment, createDummyState, createDummyEpisode } from '../testing/contextTestUtils.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateSnapshotProcessor } from './stateSnapshotProcessor.js';
import { EpisodeEditor } from '../ir/episodeEditor.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';

describe('StateSnapshotProcessor', () => {
  let processor: StateSnapshotProcessor;
  let env: ContextEnvironment;
  let generateContentMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    env = createMockEnvironment();

    generateContentMock = vi.fn().mockResolvedValue({
      text: 'Mocked Compressed State Snapshot!',
    });
    vi.spyOn(env, 'llmClient', 'get').mockReturnValue({ generateContent: generateContentMock } as unknown as BaseLlmClient);

    // Override token calc for testing
    vi.spyOn(env.tokenCalculator, 'estimateTokensForParts').mockReturnValue(100);

    processor = new StateSnapshotProcessor(env, {}, env.eventBus);
  });

  it('bypasses processing if deficit is <= 0', async () => {
    const episodes = [
      createDummyEpisode('ep-1', 'USER_PROMPT', [{ type: 'text', text: 'hello' }])
    ];
    // current: 100, max: 1000, retained: 200 (deficit 0)
    const state = createDummyState(false, 0, new Set(), 100, 1000, 200);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    expect(result).toStrictEqual(episodes);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('bypasses processing if not enough episodes to summarize (needs at least 2 inner episodes)', async () => {
    const episodes = [
      createDummyEpisode('ep-sys', 'SYSTEM_EVENT', []),
      createDummyEpisode('ep-active', 'USER_PROMPT', [{ type: 'text', text: 'help' }]),
    ];
    
    // current: 1000, max: 10000, retained: 500. Target deficit = 500
    const state = createDummyState(false, 500, new Set(), 1000, 10000, 500);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    expect(result).toStrictEqual(episodes);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('summarizes intermediate episodes into a single snapshot episode', async () => {
    const episodes = [
      createDummyEpisode('ep-0', 'SYSTEM_EVENT', []),
      createDummyEpisode('ep-1', 'USER_PROMPT', [{ type: 'text', text: 'old 1' }]),
      createDummyEpisode('ep-2', 'USER_PROMPT', [{ type: 'text', text: 'old 2' }]),
      createDummyEpisode('ep-3', 'USER_PROMPT', [{ type: 'text', text: 'current' }]),
    ];
    
    // Target deficit = 200
    const state = createDummyState(false, 200, new Set(), 1000, 10000, 800);

    const editor = new EpisodeEditor(episodes);
    await processor.process(editor, state);
    const result = editor.getFinalEpisodes();
    
    // We started with 4 episodes.
    // Episodes [1, 2] were synthesized into a single new Snapshot episode.
    // Final array should be: [0, SNAPSHOT, 3] = length 3.
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('ep-0');
    
    const snapshotEp = result[1];
    expect(snapshotEp.yield).toBeDefined();
    expect(snapshotEp.yield!.text).toContain('<CONTEXT_SNAPSHOT>');
    expect(snapshotEp.yield!.text).toContain('Mocked Compressed State Snapshot!');
    
    expect(result[2].id).toBe('ep-3');
    
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    
    const llmArgs = generateContentMock.mock.calls[0][0];
    expect(llmArgs.contents[0].parts[0].text).toContain('old 1');
    expect(llmArgs.contents[0].parts[0].text).toContain('old 2');
  });
});
