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
import { NodeType } from '../graph/types.js';
import type { InboxMessage } from '../pipeline.js';
import type { InboxSnapshotImpl } from '../pipeline/inbox.js';

describe('StateSnapshotAsyncProcessor', () => {
  it('should generate a snapshot and publish it to the inbox', async () => {
    const env = createMockEnvironment();
    // Spy on the publish method
    const publishSpy = vi.spyOn(env.inbox, 'publish');

    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'point-in-time' },
    );

    const nodeA = createDummyNode(
      'ep1',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-A',
    );
    const nodeB = createDummyNode(
      'ep1',
      NodeType.AGENT_THOUGHT,
      60,
      {},
      'node-B',
    );

    const targets = [nodeA, nodeB];
    await worker.process(createMockProcessArgs(targets, targets, []));

    // Ensure generateJson was called
    expect(env.llmClient.generateJson).toHaveBeenCalled();

    // Verify it published to the inbox
    expect(publishSpy).toHaveBeenCalledWith(
      'PROPOSED_SNAPSHOT',
      expect.objectContaining({
        newText:
          '{"active_tasks":[],"discovered_facts":[],"constraints_and_preferences":[],"recent_arc":[]}',
        consumedIds: ['node-A', 'node-B'],
        type: 'point-in-time',
      }),
    );
  });

  it('should pull previous accumulate snapshot from inbox and append new targets', async () => {
    const env = createMockEnvironment();
    const publishSpy = vi.spyOn(env.inbox, 'publish');
    const drainSpy = vi.spyOn(env.inbox, 'drainConsumed');

    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    const nodeC = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-C',
    );
    const targets = [nodeC];

    const inboxMessages: InboxMessage[] = [
      {
        id: 'draft-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now() - 1000,
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<old snapshot>',
          type: 'accumulate',
        },
      },
    ];

    const args = createMockProcessArgs(targets, targets, inboxMessages);

    await worker.process(args);

    // The old draft should be consumed
    expect(
      (args.inbox as InboxSnapshotImpl).getConsumedIds().has('draft-1'),
    ).toBe(true);
    expect(drainSpy).toHaveBeenCalledWith(expect.any(Set));

    // The new publish should contain ALL consumed IDs (old + new)
    expect(publishSpy).toHaveBeenCalledWith(
      'PROPOSED_SNAPSHOT',
      expect.objectContaining({
        newText:
          '{"active_tasks":[],"discovered_facts":[],"constraints_and_preferences":[],"recent_arc":[]}',
        consumedIds: ['node-A', 'node-B', 'node-C'], // Aggregated!
        type: 'accumulate',
      }),
    );
    // Verify the LLM was called with the old snapshot provided in the prompt
    expect(env.llmClient.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('CURRENT MASTER STATE'),
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should ignore empty targets', async () => {
    const env = createMockEnvironment();
    const publishSpy = vi.spyOn(env.inbox, 'publish');
    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    await worker.process(createMockProcessArgs([], [], []));

    expect(env.llmClient.generateContent).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('should filter previously consumed nodes and deduplicate consumedIds', async () => {
    const env = createMockEnvironment();
    const publishSpy = vi.spyOn(env.inbox, 'publish');
    const generateJsonSpy = vi.spyOn(env.llmClient, 'generateJson');

    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    const nodeA = createDummyNode(
      'ep1',
      NodeType.USER_PROMPT,
      10,
      { payload: { text: 'TEXT_A' } },
      'node-A',
    );
    const nodeB = createDummyNode(
      'ep1',
      NodeType.AGENT_THOUGHT,
      20,
      { payload: { text: 'TEXT_B' } },
      'node-B',
    );
    const nodeC = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      { payload: { text: 'TEXT_C' } },
      'node-C',
    );

    // targets include nodes that have already been consumed
    const targets = [nodeA, nodeB, nodeC];

    const inboxMessages: InboxMessage[] = [
      {
        id: 'draft-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now() - 1000,
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<old snapshot>',
          type: 'accumulate',
        },
      },
    ];

    const args = createMockProcessArgs(targets, targets, inboxMessages);

    await worker.process(args);

    // Verify it published with deduplicated IDs
    expect(publishSpy).toHaveBeenCalledWith(
      'PROPOSED_SNAPSHOT',
      expect.objectContaining({
        consumedIds: ['node-A', 'node-B', 'node-C'],
      }),
    );

    // Verify the LLM prompt DOES NOT contain TEXT_A or TEXT_B, but DOES contain TEXT_C
    const promptText = JSON.stringify(generateJsonSpy.mock.calls[0][0]);
    expect(promptText).toContain('TEXT_C');
    expect(promptText).not.toContain('TEXT_A');
    expect(promptText).not.toContain('TEXT_B');
  });

  it('should use Global Lookback to find an existing snapshot in the graph when inbox is empty', async () => {
    const env = createMockEnvironment();

    const worker = createStateSnapshotAsyncProcessor(
      'StateSnapshotAsyncProcessor',
      env,
      { type: 'accumulate' },
    );

    // Create an old snapshot with existing JSON state
    const oldStateJson = JSON.stringify({
      discovered_facts: ['Global Lookback Async Works!'],
    });
    const oldSnapshot = createDummyNode(
      'ep1',
      NodeType.SNAPSHOT,
      10,
      { payload: { text: oldStateJson } },
      'old-snap',
    );
    const nodeC = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-C',
    );

    const targets = [oldSnapshot, nodeC];
    const args = createMockProcessArgs(targets, targets, []); // Empty inbox!

    await worker.process(args);

    expect(env.llmClient.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Global Lookback Async Works!'),
              }),
            ]),
          }),
        ]),
      }),
    );
  });
});
