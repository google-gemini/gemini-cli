/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCAMPProcessor } from './campProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { AgentThought, RollingSummary } from '../graph/types.js';

import { EventEmitter } from 'node:events';

// ── Mock spawn so tests never touch the filesystem ────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & Record<string, unknown>;
    proc['stdin'] = { write: vi.fn(), end: vi.fn() };
    proc['stdout'] = new EventEmitter();
    proc['kill'] = vi.fn();
    return proc;
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeThought(
  episodeId: string,
  text: string,
  tokens: number,
  id: string,
) {
  return createDummyNode(
    episodeId,
    'AGENT_THOUGHT',
    tokens,
    { text },
    id,
  ) as AgentThought;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CAMPProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns targets unchanged when targets array is empty', async () => {
    const env = createMockEnvironment();
    const processor = createCAMPProcessor('CAMP', env, { agentName: 'RickXy' });
    const result = await processor.process(createMockProcessArgs([]));
    expect(result).toEqual([]);
  });

  it('returns targets unchanged when fewer than 2 non-anchor nodes exist', async () => {
    const env = createMockEnvironment();
    const processor = createCAMPProcessor('CAMP', env, { agentName: 'RickXy' });

    const anchor = createDummyNode(
      'ep1',
      'USER_PROMPT',
      10,
      {
        semanticParts: [{ type: 'text', text: 'hello' }],
      },
      'anchor-id',
    );

    const result = await processor.process(createMockProcessArgs([anchor]));
    expect(result).toEqual([anchor]);
  });

  it('evicts nodes and injects a RollingSummary with Mandate Snapshot', async () => {
    const env = createMockEnvironment();
    const processor = createCAMPProcessor('CAMP', env, {
      agentName: 'RickXy',
      target: 'freeNTokens',
      freeTokensTarget: 50,
    });

    const anchor = createDummyNode(
      'ep1',
      'USER_PROMPT',
      5,
      {
        semanticParts: [{ type: 'text', text: 'do stuff' }],
      },
      'anchor-id',
    );

    const t1 = makeThought('ep1', 'Working on task A', 30, 'thought-1');
    const t2 = makeThought('ep1', 'Working on task B', 30, 'thought-2');
    const t3 = makeThought('ep1', 'Working on task C', 30, 'thought-3');

    const result = await processor.process(
      createMockProcessArgs([anchor, t1, t2, t3]),
    );

    // Should have a RollingSummary at position 0, plus surviving nodes
    expect(result.length).toBeGreaterThan(0);
    const summary = result[0] as RollingSummary;
    expect(summary.type).toBe('ROLLING_SUMMARY');
    expect(summary.text).toContain('[CAMP MANDATE SNAPSHOT]');
    expect(summary.text).toContain('@RickXy');
    expect(summary.abstractsIds).toBeDefined();
    expect(summary.abstractsIds!.length).toBeGreaterThan(0);
  });

  it('preserves anchor node (first USER_PROMPT) across eviction', async () => {
    const env = createMockEnvironment();
    const processor = createCAMPProcessor('CAMP', env, {
      agentName: 'RickXy',
      freeTokensTarget: 100,
    });

    const anchor = createDummyNode(
      'ep1',
      'USER_PROMPT',
      5,
      {
        semanticParts: [{ type: 'text', text: 'anchor' }],
      },
      'anchor-id',
    );
    const t1 = makeThought('ep1', 'thought one', 60, 'thought-1');
    const t2 = makeThought('ep1', 'thought two', 60, 'thought-2');

    const result = await processor.process(
      createMockProcessArgs([anchor, t1, t2]),
    );

    const ids = result.map((n) => n.id);
    // Anchor must not appear in abstractsIds of the summary
    const summary = result.find((n) => n.type === 'ROLLING_SUMMARY');
    expect(summary?.abstractsIds).not.toContain('anchor-id');
    // anchor should still be present in the returned set (not evicted)
    expect(ids).toContain('anchor-id');
  });

  it('uses custom palacePath when provided in options', async () => {
    const env = createMockEnvironment();
    // Just ensure it constructs without error and processes correctly
    const processor = createCAMPProcessor('CAMP', env, {
      agentName: 'priyasi',
      palacePath: '/home/rrs/AI/GEMINI_PRIYA/palace',
      freeTokensTarget: 50,
    });

    const anchor = createDummyNode(
      'ep1',
      'USER_PROMPT',
      5,
      {
        semanticParts: [{ type: 'text', text: 'x' }],
      },
      'anchor-id',
    );
    const t1 = makeThought('ep1', 'priyasi thought', 40, 'thought-1');
    const t2 = makeThought('ep1', 'priyasi thought 2', 40, 'thought-2');

    const result = await processor.process(
      createMockProcessArgs([anchor, t1, t2]),
    );
    const summary = result.find((n) => n.type === 'ROLLING_SUMMARY');
    expect(summary).toBeDefined();
    expect(summary!.text).toContain('priyasi');
  });

  it('returns original targets on unexpected processor error', async () => {
    const env = createMockEnvironment();
    // Force tokenCalculator to throw to simulate an unexpected failure
    vi.spyOn(env.tokenCalculator, 'getTokenCost').mockImplementation(() => {
      throw new Error('simulated failure');
    });

    const processor = createCAMPProcessor('CAMP', env, { agentName: 'RickXy' });

    const anchor = createDummyNode(
      'ep1',
      'USER_PROMPT',
      5,
      {
        semanticParts: [{ type: 'text', text: 'x' }],
      },
      'anchor-id',
    );
    const t1 = makeThought('ep1', 'thought', 10, 'thought-1');
    const t2 = makeThought('ep1', 'thought 2', 10, 'thought-2');

    const result = await processor.process(
      createMockProcessArgs([anchor, t1, t2]),
    );
    expect(result).toEqual([anchor, t1, t2]);
  });
});
