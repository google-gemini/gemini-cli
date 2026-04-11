/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { createStateSnapshotAsyncProcessor } from './stateSnapshotAsyncProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
  createMockProcessArgs,
} from '../testing/contextTestUtils.js';

describe('StateSnapshotAsyncProcessor', () => {
  it('should generate a snapshot and publish it to the cache', async () => {
    const env = createMockEnvironment();
    
    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'point-in-time' },
    );

    const nodeA = createDummyNode('ep1', 'USER_PROMPT', 50, {}, 'node-A');
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 60, {}, 'node-B');

    const targets = [nodeA, nodeB];
    const args = createMockProcessArgs(targets, targets, []);
    const publishSpy = vi.spyOn(args.snapshotCache, 'publish');

    await worker.process(args);

    // Ensure generateContent was called
    expect(env.llmClient.generateContent).toHaveBeenCalled();

    // Verify it published to the cache
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        newText: 'Mock LLM summary response',
        consumedIds: ['node-A', 'node-B'],
        type: 'point-in-time',
      }),
      env.idGenerator,
    );
  });

  it('should pull previous accumulate snapshot from cache and append new targets', async () => {
    const env = createMockEnvironment();
    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    const nodeC = createDummyNode('ep2', 'USER_PROMPT', 50, {}, 'node-C');
    const targets = [nodeC];

    const proposals = [
      {
        id: 'draft-1',
        timestamp: Date.now() - 1000,
        consumedIds: ['node-A', 'node-B'],
        newText: '<old snapshot>',
        type: 'accumulate',
      },
    ];

    const args = createMockProcessArgs(targets, targets, proposals);
    const publishSpy = vi.spyOn(args.snapshotCache, 'publish');
    const consumeSpy = vi.spyOn(args.snapshotCache, 'consume');

    await worker.process(args);

    // The old draft should be consumed
    expect(consumeSpy).toHaveBeenCalledWith('draft-1');

    // The new publish should contain ALL consumed IDs (old + new)
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        newText: 'Mock LLM summary response',
        consumedIds: ['node-A', 'node-B', 'node-C'], // Aggregated!
        type: 'accumulate',
      }),
      env.idGenerator,
    );

    // Verify the LLM was called with the old snapshot prepended
    expect(env.llmClient.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('<old snapshot>'),
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should ignore empty targets', async () => {
    const env = createMockEnvironment();
    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    const args = createMockProcessArgs([], [], []);
    const publishSpy = vi.spyOn(args.snapshotCache, 'publish');

    await worker.process(args);

    expect(env.llmClient.generateContent).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
