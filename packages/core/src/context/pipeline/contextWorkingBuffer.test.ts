/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ContextWorkingBufferImpl } from './contextWorkingBuffer.js';
import { createDummyNode } from '../testing/contextTestUtils.js';

describe('ContextWorkingBufferImpl', () => {
  it('should initialize with a pristine graph correctly', () => {
    const pristine1 = createDummyNode(
      'ep1',
      'USER_PROMPT',
      10,
      undefined,
      'p1',
    );
    const pristine2 = createDummyNode(
      'ep1',
      'AGENT_THOUGHT',
      10,
      undefined,
      'p2',
    );

    const buffer = ContextWorkingBufferImpl.initialize([pristine1, pristine2]);

    expect(buffer.nodes).toHaveLength(2);
    expect(buffer.getAuditLog()).toHaveLength(0);

    // Pristine nodes should point to themselves
    expect(buffer.getPristineNodes('p1')).toEqual([pristine1]);
    expect(buffer.getPristineNodes('p2')).toEqual([pristine2]);
  });

  it('should track 1:1 replacements (e.g., masking) and append to audit log', () => {
    const pristine1 = createDummyNode(
      'ep1',
      'USER_PROMPT',
      10,
      undefined,
      'p1',
    );
    let buffer = ContextWorkingBufferImpl.initialize([pristine1]);

    const maskedNode = createDummyNode(
      'ep1',
      'USER_PROMPT',
      5,
      undefined,
      'm1',
    );
    // Simulate what a processor does
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (maskedNode as any).replacesId = 'p1';

    buffer = buffer.applyProcessorResult(
      'ToolMasking',
      [pristine1],
      [maskedNode],
    );

    expect(buffer.nodes).toHaveLength(1);
    expect(buffer.nodes[0].id).toBe('m1');

    const log = buffer.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].processorId).toBe('ToolMasking');
    expect(log[0].removedIds).toEqual(['p1']);
    expect(log[0].addedNodes[0].id).toBe('m1');

    // Provenance lookup: the masked node should resolve back to the pristine root
    expect(buffer.getPristineNodes('m1')).toEqual([pristine1]);
  });

  it('should track N:1 abstractions (e.g., rolling summaries)', () => {
    const p1 = createDummyNode('ep1', 'USER_PROMPT', 10, undefined, 'p1');
    const p2 = createDummyNode('ep1', 'AGENT_THOUGHT', 10, undefined, 'p2');
    const p3 = createDummyNode('ep1', 'USER_PROMPT', 10, undefined, 'p3');

    let buffer = ContextWorkingBufferImpl.initialize([p1, p2, p3]);

    const summaryNode = createDummyNode(
      'ep1',
      'ROLLING_SUMMARY',
      15,
      undefined,
      's1',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (summaryNode as any).abstractsIds = ['p1', 'p2'];

    buffer = buffer.applyProcessorResult('Summarizer', [p1, p2], [summaryNode]);

    // p1 and p2 are removed, p3 remains, s1 is added
    expect(buffer.nodes.map((n) => n.id)).toEqual(['p3', 's1']);

    // Provenance lookup: The summary node should resolve to both p1 and p2!
    const roots = buffer.getPristineNodes('s1');
    expect(roots).toHaveLength(2);
    expect(roots).toContain(p1);
    expect(roots).toContain(p2);
  });

  it('should track multi-generation provenance correctly', () => {
    const p1 = createDummyNode('ep1', 'USER_PROMPT', 10, undefined, 'p1');
    let buffer = ContextWorkingBufferImpl.initialize([p1]);

    // Gen 1: Masked
    const gen1 = createDummyNode('ep1', 'USER_PROMPT', 8, undefined, 'gen1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gen1 as any).replacesId = 'p1';
    buffer = buffer.applyProcessorResult('Masking', [p1], [gen1]);

    // Gen 2: Summarized
    const gen2 = createDummyNode(
      'ep1',
      'ROLLING_SUMMARY',
      5,
      undefined,
      'gen2',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gen2 as any).abstractsIds = ['gen1'];
    buffer = buffer.applyProcessorResult('Summarizer', [gen1], [gen2]);

    expect(buffer.nodes).toHaveLength(1);
    expect(buffer.nodes[0].id).toBe('gen2');

    // Audit log should show sequence
    const log = buffer.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].processorId).toBe('Masking');
    expect(log[1].processorId).toBe('Summarizer');

    // Multi-gen Provenance lookup: gen2 -> gen1 -> p1
    expect(buffer.getPristineNodes('gen2')).toEqual([p1]);
  });

  it('should handle net-new injected nodes without throwing', () => {
    const p1 = createDummyNode('ep1', 'USER_PROMPT', 10, undefined, 'p1');
    let buffer = ContextWorkingBufferImpl.initialize([p1]);

    const injected = createDummyNode(
      'ep1',
      'SYSTEM_EVENT',
      5,
      undefined,
      'injected1',
    );
    // No replacesId or abstractsIds

    buffer = buffer.applyProcessorResult('Injector', [], [injected]);

    expect(buffer.nodes.map((n) => n.id)).toEqual(['p1', 'injected1']);

    // It should root to itself
    expect(buffer.getPristineNodes('injected1')).toEqual([injected]);
  });
});
