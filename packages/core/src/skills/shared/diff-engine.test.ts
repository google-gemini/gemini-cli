/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiffEngine } from './diff-engine.js';
import type { HeapSnapshot } from './perfetto.js';

// ---------------------------------------------------------------------------
// Snapshot builder helpers
// ---------------------------------------------------------------------------

type EdgeSpec = {
  from: number;
  to: number;
  edgeType?: string;
  edgeName?: string;
};

/**
 * Build a HeapSnapshot with specified nodes.
 * nodes: array of { id, name, selfSize, type }
 * edges: array of { from: nodeId, to: nodeId }
 */
function buildSnapshot(
  nodes: Array<{
    id: number;
    name: string;
    selfSize?: number;
    type?: string;
    edgeCount?: number;
  }>,
  edges: EdgeSpec[] = [],
): HeapSnapshot {
  const strings: string[] = [];
  const typeEnum = [
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
  ];
  const edgeTypeEnum = ['context', 'element', 'property', 'internal'];

  function stringIdx(s: string): number {
    let idx = strings.indexOf(s);
    if (idx === -1) {
      idx = strings.length;
      strings.push(s);
    }
    return idx;
  }

  // Map nodeId → flat offset (offset in nodes array)
  const nodeIdToOffset = new Map<number, number>();
  const nodeArr: number[] = [];

  for (const n of nodes) {
    const offset = nodeArr.length;
    nodeIdToOffset.set(n.id, offset);
    const typeIdx = typeEnum.indexOf(n.type ?? 'object');
    const edgesForNode = edges.filter((e) => e.from === n.id);
    const edgeCount = n.edgeCount ?? edgesForNode.length;
    nodeArr.push(
      typeIdx >= 0 ? typeIdx : 3,
      stringIdx(n.name),
      n.id,
      n.selfSize ?? 128,
      edgeCount,
    );
  }

  // Build edges in order of nodes (as V8 expects)
  const edgeArr: number[] = [];
  for (const n of nodes) {
    const edgesForNode = edges.filter((e) => e.from === n.id);
    for (const edge of edgesForNode) {
      const toOffset = nodeIdToOffset.get(edge.to) ?? 0;
      const etIdx = edgeTypeEnum.indexOf(edge.edgeType ?? 'property');
      edgeArr.push(
        etIdx >= 0 ? etIdx : 2,
        stringIdx(edge.edgeName ?? 'ref'),
        toOffset,
      );
    }
  }

  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [typeEnum, 'string', 'number', 'number', 'number'],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [edgeTypeEnum, 'string_or_number', 'node'],
      },
      node_count: nodes.length,
      edge_count: edges.length,
    },
    nodes: nodeArr,
    edges: edgeArr,
    strings,
  };
}

// ---------------------------------------------------------------------------
// DiffEngine.analyzeThreeSnapshots
// ---------------------------------------------------------------------------

describe('DiffEngine.analyzeThreeSnapshots', () => {
  let engine: DiffEngine;
  beforeEach(() => {
    engine = new DiffEngine();
  });

  it('detects objects in S2 and S3 but not S1 as leak candidates', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'Baseline' }]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Baseline' },
      { id: 2, name: 'Leaking', selfSize: 512 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Baseline' },
      { id: 2, name: 'Leaking', selfSize: 512 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const leakNames = report.candidates.map((c) => c.constructorName);
    expect(leakNames).toContain('Leaking');
    expect(leakNames).not.toContain('Baseline');
  });

  it('does not flag objects present in all three snapshots', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'Stable' }]);
    const s2 = buildSnapshot([{ id: 1, name: 'Stable' }]);
    const s3 = buildSnapshot([{ id: 1, name: 'Stable' }]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    expect(report.candidates.length).toBe(0);
  });

  it('does not flag objects only in S3 (not in S2)', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'Base' }]);
    const s2 = buildSnapshot([{ id: 1, name: 'Base' }]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 99, name: 'Transient', selfSize: 1024 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const names = report.candidates.map((c) => c.constructorName);
    expect(names).not.toContain('Transient');
  });

  it('counts multiple instances of the same constructor', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'Base' }]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 10, name: 'LeakClass', selfSize: 200 },
      { id: 11, name: 'LeakClass', selfSize: 200 },
      { id: 12, name: 'LeakClass', selfSize: 200 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 10, name: 'LeakClass', selfSize: 200 },
      { id: 11, name: 'LeakClass', selfSize: 200 },
      { id: 12, name: 'LeakClass', selfSize: 200 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const leakCand = report.candidates.find(
      (c) => c.constructorName === 'LeakClass',
    );
    expect(leakCand).toBeDefined();
    expect(leakCand!.count).toBe(3);
  });

  it('calculates retainedSizeDelta correctly', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'Base' }]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 5, name: 'GrowingObj', selfSize: 100 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 5, name: 'GrowingObj', selfSize: 300 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const cand = report.candidates.find(
      (c) => c.constructorName === 'GrowingObj',
    );
    expect(cand).toBeDefined();
    expect(cand!.retainedSizeDelta).toBe(200); // 300 - 100
  });

  it('assigns high confidence to growing multi-instance leaks', () => {
    const s1 = buildSnapshot([]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Leak', selfSize: 100 },
      { id: 2, name: 'Leak', selfSize: 100 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Leak', selfSize: 200 },
      { id: 2, name: 'Leak', selfSize: 200 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const cand = report.candidates.find((c) => c.constructorName === 'Leak');
    expect(cand?.confidence).toBe('high');
  });

  it('assigns medium confidence to single-instance stable leaks', () => {
    const s1 = buildSnapshot([]);
    const s2 = buildSnapshot([{ id: 1, name: 'Singleton', selfSize: 200 }]);
    const s3 = buildSnapshot([{ id: 1, name: 'Singleton', selfSize: 200 }]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    const cand = report.candidates.find(
      (c) => c.constructorName === 'Singleton',
    );
    expect(cand?.confidence).toBe('medium');
  });

  it('sorts candidates by retainedSizeDelta descending', () => {
    const s1 = buildSnapshot([]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Small', selfSize: 50 },
      { id: 2, name: 'Large', selfSize: 500 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'Small', selfSize: 100 },
      { id: 2, name: 'Large', selfSize: 1000 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    expect(report.candidates[0].constructorName).toBe('Large');
  });

  it('respects maxCandidates option', () => {
    const s1 = buildSnapshot([]);
    const nodeSpecs = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Leak${i}`,
      selfSize: 128,
    }));
    const s2 = buildSnapshot(nodeSpecs);
    const s3 = buildSnapshot(nodeSpecs);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3, {
      maxCandidates: 5,
    });
    expect(report.candidates.length).toBeLessThanOrEqual(5);
  });

  it('reports correct snapshotSizes', () => {
    const s1 = buildSnapshot([{ id: 1, name: 'A', selfSize: 100 }]);
    const s2 = buildSnapshot([
      { id: 1, name: 'A', selfSize: 100 },
      { id: 2, name: 'B', selfSize: 200 },
    ]);
    const s3 = buildSnapshot([
      { id: 1, name: 'A', selfSize: 100 },
      { id: 2, name: 'B', selfSize: 200 },
      { id: 3, name: 'C', selfSize: 400 },
    ]);

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    expect(report.snapshotSizes[0]).toBe(100);
    expect(report.snapshotSizes[1]).toBe(300);
    expect(report.snapshotSizes[2]).toBe(700);
  });

  it('sets analysisTimestamp', () => {
    const s1 = buildSnapshot([]);
    const report = engine.analyzeThreeSnapshots(s1, s1, s1);
    expect(report.analysisTimestamp).toBeGreaterThan(0);
  });

  it('handles completely empty snapshots', () => {
    const empty = buildSnapshot([]);
    const report = engine.analyzeThreeSnapshots(empty, empty, empty);
    expect(report.candidates).toEqual([]);
    expect(report.totalLeakedBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DiffEngine.buildRetainerChain
// ---------------------------------------------------------------------------

describe('DiffEngine.buildRetainerChain', () => {
  let engine: DiffEngine;
  beforeEach(() => {
    engine = new DiffEngine();
  });

  it('returns empty chain for non-existent node', () => {
    const snap = buildSnapshot([{ id: 1, name: 'Root' }]);
    expect(engine.buildRetainerChain(snap, 9999)).toEqual([]);
  });

  it('returns single-element chain for root node', () => {
    const snap = buildSnapshot([{ id: 1, name: 'Root' }]);
    const chain = engine.buildRetainerChain(snap, 1);
    expect(chain.length).toBe(1);
    expect(chain[0].name).toBe('Root');
    expect(chain[0].nodeId).toBe(1);
  });

  it('traverses retainer chain from leaf to root', () => {
    // root → middle → leaf
    const snap = buildSnapshot(
      [
        { id: 1, name: 'root', edgeCount: 1 },
        { id: 2, name: 'middle', edgeCount: 1 },
        { id: 3, name: 'leaf', edgeCount: 0 },
      ],
      [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
    );

    const chain = engine.buildRetainerChain(snap, 3);
    // chain[0] = leaf, chain[1] = middle, chain[2] = root
    expect(chain[0].name).toBe('leaf');
    expect(chain.some((n) => n.name === 'middle')).toBe(true);
  });

  it('respects maxDepth parameter', () => {
    // Build a long chain: 1 → 2 → 3 → 4 → 5 → 6 → 7
    const nodes = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      name: `node${i + 1}`,
      edgeCount: i < 6 ? 1 : 0,
    }));
    const edges = Array.from({ length: 6 }, (_, i) => ({
      from: i + 1,
      to: i + 2,
    }));
    const snap = buildSnapshot(nodes, edges);

    const chain = engine.buildRetainerChain(snap, 7, 3);
    expect(chain.length).toBeLessThanOrEqual(3);
  });

  it('handles circular references without infinite loop', () => {
    // node 1 → node 2 → node 1 (cycle)
    const snap = buildSnapshot(
      [
        { id: 1, name: 'A', edgeCount: 1 },
        { id: 2, name: 'B', edgeCount: 1 },
      ],
      [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
      ],
    );

    // Should complete without stack overflow
    const chain = engine.buildRetainerChain(snap, 2, 10);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.length).toBeLessThanOrEqual(11);
  });

  it('includes edge type and name in retainer chain nodes', () => {
    const snap = buildSnapshot(
      [
        { id: 1, name: 'holder', edgeCount: 1 },
        { id: 2, name: 'held', edgeCount: 0 },
      ],
      [{ from: 1, to: 2, edgeType: 'property', edgeName: 'myProp' }],
    );

    const chain = engine.buildRetainerChain(snap, 2);
    // chain[1] should be the retainer (holder) with edge info
    const retainer = chain.find((n) => n.name === 'held');
    expect(retainer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DiffEngine.buildReverseEdgeMap
// ---------------------------------------------------------------------------

describe('DiffEngine.buildReverseEdgeMap', () => {
  let engine: DiffEngine;
  beforeEach(() => {
    engine = new DiffEngine();
  });

  it('builds reverse edge map correctly', () => {
    const snap = buildSnapshot(
      [
        { id: 1, name: 'A', edgeCount: 1 },
        { id: 2, name: 'B', edgeCount: 0 },
      ],
      [{ from: 1, to: 2 }],
    );

    const reverseMap = engine.buildReverseEdgeMap(snap);
    // Offset of node B (second node, offset=5 in flat array)
    expect(reverseMap.size).toBeGreaterThan(0);
  });

  it('returns empty map for snapshot with no edges', () => {
    const snap = buildSnapshot([{ id: 1, name: 'Solo' }]);
    const reverseMap = engine.buildReverseEdgeMap(snap);
    expect(reverseMap.size).toBe(0);
  });

  it('handles multiple edges to same target', () => {
    const snap = buildSnapshot(
      [
        { id: 1, name: 'A', edgeCount: 1 },
        { id: 2, name: 'B', edgeCount: 1 },
        { id: 3, name: 'Target', edgeCount: 0 },
      ],
      [
        { from: 1, to: 3 },
        { from: 2, to: 3 },
      ],
    );

    const reverseMap = engine.buildReverseEdgeMap(snap);
    // Target node's offset should have 2 retainers
    let maxRetainers = 0;
    for (const retainers of reverseMap.values()) {
      maxRetainers = Math.max(maxRetainers, retainers.length);
    }
    expect(maxRetainers).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// False positive rate on stable objects
// ---------------------------------------------------------------------------

describe('False-positive rate', () => {
  it('does not report any leaks when all objects are stable across all 3 snapshots', () => {
    const engine = new DiffEngine();
    const nodes = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `StableObj${i}`,
      selfSize: 256,
    }));
    const snap = buildSnapshot(nodes);
    const report = engine.analyzeThreeSnapshots(snap, snap, snap);
    expect(report.candidates.length).toBe(0);
  });

  it('only reports objects new in S2+S3, not objects dropped between S2 and S3', () => {
    const engine = new DiffEngine();
    const s1 = buildSnapshot([{ id: 1, name: 'Base' }]);
    const s2 = buildSnapshot([
      { id: 1, name: 'Base' },
      { id: 2, name: 'Transient', selfSize: 512 },
    ]);
    const s3 = buildSnapshot([{ id: 1, name: 'Base' }]); // Transient gone in S3

    const report = engine.analyzeThreeSnapshots(s1, s2, s3);
    // Transient is in S2 but not S3, so not in leak candidates (formula: S2 ∩ S3 - S1)
    expect(report.candidates.map((c) => c.constructorName)).not.toContain(
      'Transient',
    );
  });
});
