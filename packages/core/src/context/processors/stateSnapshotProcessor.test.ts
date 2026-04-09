/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { StateSnapshotProcessor } from './stateSnapshotProcessor.js';
import {
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import { InboxSnapshotImpl } from '../sidecar/inbox.js';

describe('StateSnapshotProcessor', () => {
  it('should ignore if budget is satisfied', async () => {
    const env = createMockEnvironment();
    const processor = StateSnapshotProcessor.create(env, { target: 'incremental' });
    const targets = [createDummyNode('ep1', 'USER_PROMPT')];
    const inbox = new InboxSnapshotImpl([]);

    const result = await processor.process({ buffer: {} as any, targets, inbox });
    expect(result).toBe(targets); // Strict equality
  });

  it('should apply a valid snapshot from the Inbox (Fast Path)', async () => {
    const env = createMockEnvironment();
    const processor = StateSnapshotProcessor.create(env, { target: 'incremental' });

    const nodeA = createDummyNode('ep1', 'USER_PROMPT', 50, {}, 'node-A');
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 60, {}, 'node-B');
    const nodeC = createDummyNode('ep2', 'USER_PROMPT', 50, {}, 'node-C');
    
    const targets = [nodeA, nodeB, nodeC];

    // The background worker created a snapshot of A and B
    const inbox = new InboxSnapshotImpl([
      {
        id: 'msg-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now(),
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<compressed A and B>',
          type: 'point-in-time',
        }
      }
    ]);

    const result = await processor.process({ buffer: {} as any, targets, inbox });

    // Should remove A and B, insert Snapshot, keep C
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('SNAPSHOT');
    expect(result[1].id).toBe('node-C');

    // Should consume the message
    expect(inbox.getConsumedIds().has('msg-1')).toBe(true);
  });

  it('should reject a snapshot if the nodes were modified/deleted (Cache Invalidated)', async () => {
    const env = createMockEnvironment();
    const processor = StateSnapshotProcessor.create(env, { target: 'incremental' });
    // Make deficit 0 so we don't fall through to the sync backstop and fail the test that way

    // node-A is MISSING (user deleted it)
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 60, {}, 'node-B');
    const targets = [nodeB];

    const inbox = new InboxSnapshotImpl([
      {
        id: 'msg-1',
        topic: 'PROPOSED_SNAPSHOT',
        timestamp: Date.now(),
        payload: {
          consumedIds: ['node-A', 'node-B'],
          newText: '<compressed A and B>',
        }
      }
    ]);

    const result = await processor.process({ buffer: {} as any, targets, inbox });

    // Because deficit is 0, and Inbox was rejected, nothing should change
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('node-B');
    expect(inbox.getConsumedIds().has('msg-1')).toBe(false);
  });

  it('should fall back to sync backstop if inbox is empty', async () => {
    const env = createMockEnvironment();
    const processor = StateSnapshotProcessor.create(env, { target: 'max' }); // Summarize all

    const nodeA = createDummyNode('ep1', 'USER_PROMPT', 50, {}, 'node-A');
    const nodeB = createDummyNode('ep1', 'AGENT_THOUGHT', 60, {}, 'node-B');
    const nodeC = createDummyNode('ep2', 'USER_PROMPT', 50, {}, 'node-C');
    const targets = [nodeA, nodeB, nodeC];
    const inbox = new InboxSnapshotImpl([]);

    const result = await processor.process({ buffer: {} as any, targets, inbox });

    // Should synthesize a new snapshot synchronously
    expect(env.llmClient.generateContent).toHaveBeenCalled();
    expect(result.length).toBe(2); // nodeA is skipped as "system prompt", snapshot + nodeA
    expect(result[1].type).toBe('SNAPSHOT');
  });
});
