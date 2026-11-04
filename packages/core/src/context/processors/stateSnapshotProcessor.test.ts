/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { createStateSnapshotProcessor } from './stateSnapshotProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
  createMockProcessArgs,
} from '../testing/contextTestUtils.js';
import { NodeType } from '../graph/types.js';
import type { InboxSnapshotImpl } from '../pipeline/inbox.js';

describe('StateSnapshotProcessor', () => {
  it('should ignore if budget is satisfied', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      {
        target: 'incremental',
      },
    );
    const targets = [createDummyNode('ep1', NodeType.USER_PROMPT)];
    const result = await processor.process(createMockProcessArgs(targets));
    expect(result).toBe(targets); // Strict equality
  });

  it('should apply a valid snapshot from the Inbox (Fast Path)', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      {
        target: 'incremental',
      },
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
    const nodeC = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-C',
    );

    const targets = [nodeA, nodeB, nodeC];

    // The async background pipeline created a snapshot of A and B
    const messages = [
      {
        id: 'msg-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now(),
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<compressed A and B>',
          type: 'point-in-time',
        },
      },
    ];

    const processArgs = createMockProcessArgs(targets, [], messages);
    const result = await processor.process(processArgs);

    // Should remove A and B, insert Snapshot, keep C
    expect(result.length).toBe(2);
    expect(result[0].type).toBe(NodeType.SNAPSHOT);
    expect(result[1].id).toBe('node-C');

    // Should consume the message
    expect(
      (processArgs.inbox as InboxSnapshotImpl).getConsumedIds().has('msg-1'),
    ).toBe(true);
  });

  it('should reject a snapshot if the nodes were modified/deleted (Cache Invalidated)', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      {
        target: 'incremental',
      },
    );
    // Make deficit 0 so we don't fall through to the sync backstop and fail the test that way

    // node-A is MISSING (user deleted it)
    const nodeB = createDummyNode(
      'ep1',
      NodeType.AGENT_THOUGHT,
      60,
      {},
      'node-B',
    );
    const targets = [nodeB];

    const messages = [
      {
        id: 'msg-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now(),
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<compressed A and B>',
        },
      },
    ];

    const processArgs = createMockProcessArgs(targets, [], messages);
    const result = await processor.process(processArgs);

    // Because deficit is 0, and Inbox was rejected, nothing should change
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('node-B');
    expect(
      (processArgs.inbox as InboxSnapshotImpl).getConsumedIds().has('msg-1'),
    ).toBe(false);
  });

  it('should fall back to sync backstop if inbox is empty', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      { target: 'max' },
    ); // Summarize all

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
    const nodeC = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-C',
    );
    const targets = [nodeA, nodeB, nodeC];
    const result = await processor.process(createMockProcessArgs(targets));

    // Should synthesize a new snapshot synchronously
    expect(env.llmClient.generateJson).toHaveBeenCalled();
    expect(result.length).toBe(1); // nodeA is no longer protected, so everything is snapshotted
    expect(result[0].type).toBe(NodeType.SNAPSHOT);
  });

  it('should use Global Lookback to find an existing snapshot in the graph as the baseline', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      { target: 'incremental' },
    );

    // Create an old snapshot with existing JSON state
    const oldStateJson = JSON.stringify({
      discovered_facts: ['Global Lookback Works!'],
    });
    const oldSnapshot = createDummyNode(
      'ep1',
      NodeType.SNAPSHOT,
      10,
      { payload: { text: oldStateJson } },
      'old-snap',
    );
    const nodeA = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-A',
    );

    // targets array contains the snapshot
    const targets = [oldSnapshot, nodeA];

    await processor.process(createMockProcessArgs(targets));

    // The SnapshotGenerator should have been called with the oldStateJson as the baseline
    expect(env.llmClient.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Global Lookback Works!'),
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('should garbage collect the old baseline snapshot from the live graph when creating a new sync snapshot', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor(
      'StateSnapshotProcessor',
      env,
      { target: 'incremental' },
    );

    const oldSnapshot = createDummyNode(
      'ep1',
      NodeType.SNAPSHOT,
      10,
      { payload: { text: '{}' } },
      'old-snap',
    );
    const nodeA = createDummyNode(
      'ep2',
      NodeType.USER_PROMPT,
      50,
      {},
      'node-A',
    );

    // The processor summarizes these 2 nodes
    const result = await processor.process(
      createMockProcessArgs([oldSnapshot, nodeA]),
    );

    // It should have replaced BOTH the old snapshot and the new node with ONE new snapshot
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.SNAPSHOT);
    expect(result[0].id).not.toBe('old-snap');
    expect(result[0].abstractsIds).toContain('old-snap');
    expect(result[0].abstractsIds).toContain('node-A');
  });
});
