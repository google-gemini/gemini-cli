/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PerfettoTraceBuilder,
  analyzeHeapSnapshot,
  diffHeapSnapshots,
  type HeapSnapshot,
} from './perfetto.js';

describe('PerfettoTraceBuilder', () => {
  let builder: PerfettoTraceBuilder;

  beforeEach(() => {
    builder = new PerfettoTraceBuilder();
  });

  it('should create a track and return uuid', () => {
    const uuid = builder.createTrack('Test Track');
    expect(typeof uuid).toBe('number');
    expect(uuid).toBeGreaterThan(0);
  });

  it('should build valid trace JSON', () => {
    builder.createTrack('Memory');
    const json = builder.build();
    const parsed = JSON.parse(json);

    expect(parsed.traceEvents).toBeDefined();
    expect(Array.isArray(parsed.traceEvents)).toBe(true);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.source).toBe('gemini-cli-investigate');
  });

  it('should add memory snapshots', () => {
    const trackUuid = builder.createTrack('Memory');
    builder.addMemorySnapshot(trackUuid, 1024, 2048, 4096, 512);

    const json = builder.build();
    const parsed = JSON.parse(json);

    // Should have track descriptor + memory snapshot
    expect(parsed.traceEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Heap Snapshot Analysis', () => {
  const createMockHeapSnapshot = (): HeapSnapshot => ({
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [
          [
            'hidden',
            'array',
            'string',
            'object',
            'code',
            'closure',
            'regexp',
            'number',
            'native',
            'synthetic',
            'concatenated string',
            'sliced string',
          ],
          'string',
          'number',
          'number',
          'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          [
            'context',
            'element',
            'property',
            'internal',
            'hidden',
            'shortcut',
            'weak',
          ],
          'string_or_number',
          'node',
        ],
      },
      node_count: 5,
      edge_count: 4,
    },
    nodes: [
      // Node 0: Array
      1,
      0,
      1,
      32,
      2, // type=array(1), name=strings[0], id=1, self_size=32, edge_count=2
      // Node 1: String (DetachedHTMLDivElement pattern)
      3,
      1,
      2,
      16,
      1, // type=object(3), name=strings[1] (DetachedHTMLDivElement), id=2, self_size=16, edge_count=1
      // Node 2: String (normal)
      3,
      2,
      3,
      16,
      0, // type=object(3), name=strings[2], id=3, self_size=16, edge_count=0
      // Node 3: Object
      3,
      3,
      4,
      24,
      1, // type=object(3), name=strings[3], id=4, self_size=24, edge_count=1
      // Node 4: Array (large)
      1,
      4,
      5,
      48,
      0, // type=array(1), name=strings[4], id=5, self_size=48, edge_count=0
    ],
    edges: [
      // Edge 0: Node 0 -> Node 1
      1,
      0,
      5, // type=element(1), name=strings[0], to_node=5 (index of node 1)
      // Edge 1: Node 0 -> Node 2
      1,
      0,
      10, // type=element(1), name=strings[0], to_node=10 (index of node 2)
      // Edge 2: Node 1 -> Node 3
      2,
      5,
      15, // type=property(2), name=strings[5], to_node=15 (index of node 3)
      // Edge 3: Node 3 -> Node 4
      2,
      6,
      20, // type=property(2), name=strings[6], to_node=20 (index of node 4)
    ],
    strings: [
      'Array', // 0
      'DetachedHTMLDivElement', // 1 - suspicious pattern
      'normalString', // 2
      'Object', // 3
      'LargeArray', // 4
      'prop1', // 5
      'items', // 6
    ],
  });

  it('should analyze heap snapshot for suspicious patterns', () => {
    const snapshot = createMockHeapSnapshot();
    const result = analyzeHeapSnapshot(snapshot);

    expect(result.suspiciousPatterns.length).toBeGreaterThan(0);
    expect(result.suspiciousPatterns[0]).toContain('detached');
    expect(result.topObjectTypes.length).toBeGreaterThan(0);
  });

  it('should detect detached DOM nodes', () => {
    const snapshot = createMockHeapSnapshot();
    const result = analyzeHeapSnapshot(snapshot);

    const detachedLeak = result.potentialLeaks.find(
      (leak) => leak.type === 'DetachedHTMLDivElement',
    );
    expect(detachedLeak).toBeDefined();
  });

  it('should calculate type statistics correctly', () => {
    const snapshot = createMockHeapSnapshot();
    const result = analyzeHeapSnapshot(snapshot);

    // Should have entries for each unique type name
    expect(result.topObjectTypes.length).toBeGreaterThan(0);

    // Check that sizes are accumulated correctly
    const detachedEntry = result.topObjectTypes.find(
      (t) => t.type === 'DetachedHTMLDivElement',
    );
    expect(detachedEntry?.count).toBe(1);
    expect(detachedEntry?.size).toBe(16);
  });
});

describe('Heap Snapshot Diff', () => {
  const createSnapshot = (
    objectCounts: Record<string, { count: number; size: number }>,
  ): HeapSnapshot => {
    const strings: string[] = [];
    const nodes: number[] = [];
    const edges: number[] = [];
    let stringId = 0;

    for (const [type, stats] of Object.entries(objectCounts)) {
      const typeIdx = strings.indexOf(type);
      const nameIdx =
        typeIdx === -1 ? (strings.push(type), stringId++) : typeIdx;

      for (let i = 0; i < stats.count; i++) {
        nodes.push(
          3, // type = object
          nameIdx,
          nodes.length / 5 + 1, // id
          stats.size / stats.count, // self_size per instance
          0, // edge_count
        );
      }
    }

    return {
      snapshot: {
        meta: {
          node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
          node_types: [
            [
              'hidden',
              'array',
              'string',
              'object',
              'code',
              'closure',
              'regexp',
              'number',
              'native',
              'synthetic',
              'concatenated string',
              'sliced string',
            ],
            'string',
            'number',
            'number',
            'number',
          ],
          edge_fields: ['type', 'name_or_index', 'to_node'],
          edge_types: [
            [
              'context',
              'element',
              'property',
              'internal',
              'hidden',
              'shortcut',
              'weak',
            ],
            'string_or_number',
            'node',
          ],
        },
        node_count: nodes.length / 5,
        edge_count: 0,
      },
      nodes,
      edges,
      strings,
    };
  };

  it('should detect added objects', () => {
    const before = createSnapshot({ Array: { count: 5, size: 100 } });
    const after = createSnapshot({
      Array: { count: 5, size: 100 },
      Object: { count: 10, size: 200 },
    });

    const diff = diffHeapSnapshots(before, after);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0].type).toBe('Object');
    expect(diff.added[0].count).toBe(10);
  });

  it('should detect grown objects', () => {
    const before = createSnapshot({ Array: { count: 10, size: 200 } });
    const after = createSnapshot({ Array: { count: 20, size: 400 } });

    const diff = diffHeapSnapshots(before, after);

    expect(diff.grown.length).toBe(1);
    expect(diff.grown[0].type).toBe('Array');
    expect(diff.grown[0].countDelta).toBe(10);
    expect(diff.grown[0].growthRate).toBe(1.0); // 100% growth
  });

  it('should detect removed objects', () => {
    const before = createSnapshot({
      Array: { count: 5, size: 100 },
      String: { count: 3, size: 60 },
    });
    const after = createSnapshot({ Array: { count: 5, size: 100 } });

    const diff = diffHeapSnapshots(before, after);

    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0].type).toBe('String');
  });
});
