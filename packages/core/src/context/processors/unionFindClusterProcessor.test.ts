/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createUnionFindClusterProcessor } from './unionFindClusterProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import { NodeType } from '../graph/types.js';

describe('UnionFindClusterProcessor', () => {
  it('should pass through when fewer than 3 targets', async () => {
    const env = createMockEnvironment();
    const processor = createUnionFindClusterProcessor(
      'UnionFindCluster',
      env,
      {},
    );

    const targets = [
      createDummyNode('t1', NodeType.USER_PROMPT, 10, {
        payload: { text: 'hello' },
      }),
      createDummyNode('t2', NodeType.AGENT_THOUGHT, 10, {
        payload: { text: 'world' },
      }),
    ];

    const result = await processor.process(createMockProcessArgs(targets));
    expect(result.length).toBe(2);
    expect(result[0].id).toBe(targets[0].id);
    expect(result[1].id).toBe(targets[1].id);
  });

  it('should cluster similar nodes into a Snapshot', async () => {
    const env = createMockEnvironment();
    const processor = createUnionFindClusterProcessor('UnionFindCluster', env, {
      mergeThreshold: 0.1,
      maxColdClusters: 2,
      graduateAt: 2,
      evictAt: 4,
    });

    const targets = [
      createDummyNode(
        't1',
        NodeType.USER_PROMPT,
        10,
        { payload: { text: 'the quick brown fox jumps over the lazy dog' } },
        'node-1',
      ),
      createDummyNode(
        't2',
        NodeType.AGENT_THOUGHT,
        10,
        { payload: { text: 'the quick brown fox runs over the lazy dog' } },
        'node-2',
      ),
      createDummyNode(
        't3',
        NodeType.AGENT_THOUGHT,
        10,
        { payload: { text: 'the quick brown fox leaps over the lazy dog' } },
        'node-3',
      ),
      createDummyNode(
        't4',
        NodeType.USER_PROMPT,
        10,
        {
          payload: {
            text: 'completely different topic about quantum physics and entanglement',
          },
        },
        'node-4',
      ),
      createDummyNode(
        't5',
        NodeType.USER_PROMPT,
        10,
        {
          payload: {
            text: 'another message about quantum mechanics and wave functions',
          },
        },
        'node-5',
      ),
    ];

    const result = await processor.process(createMockProcessArgs(targets));

    // Should have fewer nodes than input due to clustering
    expect(result.length).toBeLessThan(targets.length);

    // Check that Snapshot nodes exist with abstractsIds
    const snapshots = result.filter(
      (n) => n.type === NodeType.SNAPSHOT,
    ) as Snapshot[];
    expect(snapshots.length).toBeGreaterThan(0);

    for (const snap of snapshots) {
      expect(snap.abstractsIds).toBeDefined();
      expect(snap.abstractsIds!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('should respect maxColdClusters cap', async () => {
    const env = createMockEnvironment();
    const processor = createUnionFindClusterProcessor('UnionFindCluster', env, {
      mergeThreshold: 0.99,
      maxColdClusters: 2,
      graduateAt: 1,
      evictAt: 3,
    });

    const targets = Array.from({ length: 10 }, (_, i) =>
      createDummyNode(
        `t${i}`,
        NodeType.USER_PROMPT,
        10,
        {
          payload: { text: `unique topic number ${i} about subject ${i * 7}` },
        },
        `node-${i}`,
      ),
    );

    const result = await processor.process(createMockProcessArgs(targets));

    const snapshots = result.filter((n) => n.type === NodeType.SNAPSHOT);
    // maxColdClusters=2 means at most 2 cluster snapshots
    expect(snapshots.length).toBeLessThanOrEqual(2);
  });

  it('should preserve nodes with empty text', async () => {
    const env = createMockEnvironment();
    const processor = createUnionFindClusterProcessor('UnionFindCluster', env, {
      graduateAt: 2,
      evictAt: 4,
    });

    const targets = [
      createDummyNode('t1', NodeType.USER_PROMPT, 10, {
        payload: { text: 'hello world foo bar' },
      }),
      createDummyNode('t2', NodeType.AGENT_THOUGHT, 10, {
        payload: { text: '' },
      }),
      createDummyNode('t3', NodeType.USER_PROMPT, 10, {
        payload: { text: 'hello world foo bar again' },
      }),
      createDummyNode('t4', NodeType.USER_PROMPT, 10, {
        payload: { text: 'something else entirely different' },
      }),
    ];

    const result = await processor.process(createMockProcessArgs(targets));

    // The empty-text node should still be present
    const emptyNode = result.find((n) => n.payload.text === '');
    expect(emptyNode).toBeDefined();
  });
});
