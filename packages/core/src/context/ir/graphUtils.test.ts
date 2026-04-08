/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateWorkingBufferView } from './graphUtils.js';
import {
  createMockEnvironment,
  createDummyEpisode,
} from '../testing/contextTestUtils.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { AgentThought, UserPrompt } from './types.js';

describe('graphUtils (View Generator)', () => {
  let env: ContextEnvironment;

  beforeEach(() => {
    vi.resetAllMocks();
    env = createMockEnvironment();
    // Our token mock is 1 char = 1 token for simplicity
    vi.spyOn(
      env.tokenCalculator,
      'calculateEpisodeListTokens',
    ).mockImplementation((eps) =>
      eps.reduce(
        (acc, ep) => acc + (ep.trigger.metadata.originalTokens || 100),
        0,
      ),
    );
  });

  it('returns pristine episodes untouched if under budget', () => {
    const episodes = [
      createDummyEpisode('ep-1', 'USER_PROMPT', [{ type: 'text', text: '1' }]),
      createDummyEpisode('ep-2', 'USER_PROMPT', [{ type: 'text', text: '2' }]),
    ];

    // We retain 5000 tokens. Total mock tokens = 200.
    const view = generateWorkingBufferView(episodes, 5000, env.tracer, env);

    expect(view).toHaveLength(2);
    // Must be a deep copy! The view generator clones episodes.
    expect(view).not.toBe(episodes);
    expect(view[0].id).toBe('ep-1');
    expect(view[1].id).toBe('ep-2');
  });

  it('swaps to Masked variant when over budget (rolling backwards)', () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [
      { text: '1', type: 'text' },
    ]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [
      { text: '2', type: 'text' },
    ]);

    ep1.variants = {
      masked: {
        type: 'masked',
        status: 'ready',
        text: '<MASKED>',
        recoveredTokens: 10,
      },
    };

    // We only retain 100 tokens.
    // ep-2 (newest) takes 100 tokens.
    // Now rolling = 100. Over budget!
    // ep-1 is evaluated, and swapped for Masked.
    const view = generateWorkingBufferView([ep1, ep2], 10, env.tracer, env);

    expect(view).toHaveLength(2);
    expect(view[1].id).toBe('ep-2'); // Unchanged (newest)

    expect(view[0].id).toBe('ep-1');
    expect(
      (view[0].trigger as UserPrompt).semanticParts[0].presentation?.text,
    ).toBe('<MASKED>');
  });

  it('swaps to Summary variant when over budget', () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [
      { type: 'text', text: '1' },
    ]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [
      { type: 'text', text: '2' },
    ]);

    ep1.variants = {
      summary: {
        type: 'summary',
        status: 'ready',
        text: '<SUMMARY>',
        recoveredTokens: 50,
      },
    };

    const view = generateWorkingBufferView([ep1, ep2], 10, env.tracer, env);

    expect(view).toHaveLength(2);

    // The summary completely replaces the internal steps and clears the yield.
    expect(view[0].steps).toHaveLength(1);
    expect(view[0].steps[0].type).toBe('AGENT_THOUGHT');
    expect((view[0].steps[0] as AgentThought).text).toBe('<SUMMARY>');
    expect(view[0].yield).toBeUndefined();
  });

  it('handles complex N-to-1 Snapshot skipping gracefully', () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [
      { type: 'text', text: '1' },
    ]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [
      { type: 'text', text: '2' },
    ]);
    const ep3 = createDummyEpisode('ep-3', 'USER_PROMPT', [
      { type: 'text', text: '3' },
    ]);
    const ep4 = createDummyEpisode('ep-4', 'USER_PROMPT', [
      { type: 'text', text: '4' },
    ]);

    // ep-3 has a snapshot that replaces [ep-1, ep-2, ep-3]
    const snapshotEp = createDummyEpisode('snap-1', 'SYSTEM_EVENT', []);

    ep3.variants = {
      snapshot: {
        type: 'snapshot',
        status: 'ready',
        episode: snapshotEp,
        replacedEpisodeIds: ['ep-1', 'ep-2', 'ep-3'],
      },
    };

    // We only retain 5 tokens, forcing the sweep to use variants for EVERYTHING except ep4.
    const view = generateWorkingBufferView(
      [ep1, ep2, ep3, ep4],
      5,
      env.tracer,
      env,
    );

    // Result should be exactly: [snapshot, ep-4]
    expect(view).toHaveLength(2);
    expect(view[0].id).toBe('snap-1');
    expect(view[1].id).toBe('ep-4');
  });

  it('ignores variants that are not yet "ready"', () => {
    const ep1 = createDummyEpisode('ep-1', 'USER_PROMPT', [
      { type: 'text', text: '1' },
    ]);
    const ep2 = createDummyEpisode('ep-2', 'USER_PROMPT', [
      { type: 'text', text: '2' },
    ]);

    ep1.variants = {
      masked: {
        type: 'masked',
        status: 'computing',
        text: '<MASKED>',
        recoveredTokens: 10,
      },
    };

    const view = generateWorkingBufferView([ep1, ep2], 10, env.tracer, env);

    // Because the variant was computing, it must fall back to the raw pristine text.
    expect(view).toHaveLength(2);
    expect(
      (view[0].trigger as UserPrompt).semanticParts[0].presentation,
    ).toBeUndefined();
  });
});
