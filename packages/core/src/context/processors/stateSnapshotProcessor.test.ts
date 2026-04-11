/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { createStateSnapshotProcessor } from './stateSnapshotProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
  createMockProcessArgs,
} from '../testing/contextTestUtils.js';

describe('StateSnapshotProcessor', () => {
  it('should return original targets if no nodes to process', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor('StateSnapshotProcessor', env, {
      target: 'max',
    });

    const result = await processor.process(createMockProcessArgs([], []));
    expect(result).toEqual([]);
  });

  it('should use pre-computed snapshot from cache if valid', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor('StateSnapshotProcessor', env, {
      target: 'max', // implies 'accumulate' type
    });

    const nodeA = createDummyNode('ep1', 'USER_PROMPT', 50, {}, 'node-A');
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 50, {}, 'node-B');
    const nodeC = createDummyNode('ep1', 'TOOL_EXECUTION', 50, {}, 'node-C');

    const targets = [nodeA, nodeB, nodeC];

    const proposals = [
      {
        id: 'msg-1',
        timestamp: Date.now(),
        newText: 'Pre-computed summary of A and B',
        consumedIds: ['node-A', 'node-B'],
        type: 'accumulate',
      },
    ];

    const processArgs = createMockProcessArgs(targets, targets, proposals);
    const consumeSpy = vi.spyOn(processArgs.snapshotCache, 'consume');

    const result = await processor.process(processArgs);

    // It should have replaced A and B with a SNAPSHOT, and kept C
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('SNAPSHOT');
    expect((result[0] as any).text).toBe('Pre-computed summary of A and B');
    expect(result[1]).toEqual(nodeC);

    // The message should be consumed
    expect(consumeSpy).toHaveBeenCalledWith('msg-1');
  });

  it('should fall back to synchronous generation if no valid snapshot in cache', async () => {
    const env = createMockEnvironment();
    const processor = createStateSnapshotProcessor('StateSnapshotProcessor', env, {
      target: 'max',
    });

    const nodeA = createDummyNode('ep1', 'USER_PROMPT', 50, {}, 'node-A');
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 50, {}, 'node-B');

    const targets = [nodeA, nodeB];

    // Invalid snapshot (consumes a node that isn't in targets)
    const proposals = [
      {
        id: 'msg-1',
        timestamp: Date.now(),
        newText: 'Invalid summary',
        consumedIds: ['node-X'],
        type: 'accumulate',
      },
    ];

    const processArgs = createMockProcessArgs(targets, targets, proposals);
    const consumeSpy = vi.spyOn(processArgs.snapshotCache, 'consume');

    const result = await processor.process(processArgs);

    // Should have generated synchronously
    expect(env.llmClient.generateContent).toHaveBeenCalled();
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('SNAPSHOT');
    expect((result[0] as any).text).toBe('Mock LLM summary response');

    // Should not have consumed the invalid message
    expect(consumeSpy).not.toHaveBeenCalledWith('msg-1');
  });
});
