/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  HeapSnapshotAnalyzer,
  type RawHeapSnapshot,
  type LeakReport,
} from './heapSnapshotAnalyzer.js';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

/**
 * Build a minimal valid V8 heap snapshot with customizable nodes and edges.
 * Follows the real V8 format: flat arrays indexed by meta field counts.
 */
function buildSnapshot(config: {
  nodes: Array<{
    type: number; // index into NODE_TYPES
    name: number; // index into strings[]
    id: number; // V8 stable id
    selfSize: number;
    edgeCount: number;
    traceNodeId?: number;
    detachedness?: number;
  }>;
  edges: Array<{
    type: number; // index into EDGE_TYPES
    nameOrIndex: number;
    toNode: number; // index into nodes flat array (multiply by 7)
  }>;
  strings: string[];
}): RawHeapSnapshot {
  const nodeFields = [
    'type',
    'name',
    'id',
    'self_size',
    'edge_count',
    'trace_node_id',
    'detachedness',
  ];
  const edgeFields = ['type', 'name_or_index', 'to_node'];

  const flatNodes: number[] = [];
  for (const n of config.nodes) {
    flatNodes.push(
      n.type,
      n.name,
      n.id,
      n.selfSize,
      n.edgeCount,
      n.traceNodeId ?? 0,
      n.detachedness ?? 0,
    );
  }

  const flatEdges: number[] = [];
  for (const e of config.edges) {
    flatEdges.push(e.type, e.nameOrIndex, e.toNode * 7); // toNode is node index * fieldCount
  }

  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
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
            'symbol',
            'bigint',
            'object shape',
          ],
          'string',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        edge_fields: edgeFields,
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
      node_count: config.nodes.length,
      edge_count: config.edges.length,
    },
    nodes: flatNodes,
    edges: flatEdges,
    strings: config.strings,
  };
}

/**
 * Create a simple graph:
 *   (root) --property "app"--> (Object "App")
 *       |                          |
 *       |                          +--property "data"--> (Array "data")
 *       |                          |
 *       |                          +--property "cache"--> (Object "Cache")
 *       |
 *       +--internal--> (hidden "(GC roots)")
 */
function createSimpleSnapshot(idOffset: number = 0): RawHeapSnapshot {
  return buildSnapshot({
    strings: [
      '',
      '(GC roots)',
      'App',
      'data',
      'Cache',
      'app',
      'cache',
      '(internal)',
    ],
    nodes: [
      // 0: root (synthetic)
      {
        type: 9 /* synthetic */,
        name: 1 /* (GC roots) */,
        id: 1 + idOffset,
        selfSize: 0,
        edgeCount: 2,
      },
      // 1: App object
      {
        type: 3 /* object */,
        name: 2 /* App */,
        id: 100 + idOffset,
        selfSize: 256,
        edgeCount: 2,
      },
      // 2: data array
      {
        type: 1 /* array */,
        name: 3 /* data */,
        id: 200 + idOffset,
        selfSize: 1024,
        edgeCount: 0,
      },
      // 3: Cache object
      {
        type: 3 /* object */,
        name: 4 /* Cache */,
        id: 300 + idOffset,
        selfSize: 512,
        edgeCount: 0,
      },
      // 4: hidden internal
      {
        type: 0 /* hidden */,
        name: 7 /* (internal) */,
        id: 400 + idOffset,
        selfSize: 64,
        edgeCount: 0,
      },
    ],
    edges: [
      // root → App (property "app")
      { type: 2 /* property */, nameOrIndex: 5 /* app */, toNode: 1 },
      // root → internal (internal)
      { type: 3 /* internal */, nameOrIndex: 7 /* (internal) */, toNode: 4 },
      // App → data (property "data")
      { type: 2 /* property */, nameOrIndex: 3 /* data */, toNode: 2 },
      // App → Cache (property "cache")
      { type: 2 /* property */, nameOrIndex: 6 /* cache */, toNode: 3 },
    ],
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HeapSnapshotAnalyzer', () => {
  let analyzer: HeapSnapshotAnalyzer;

  beforeEach(() => {
    analyzer = new HeapSnapshotAnalyzer();
  });

  describe('parse()', () => {
    it('should parse a minimal snapshot with correct node count', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      expect(analyzer.getNodes().length).toBe(5);
    });

    it('should resolve node types correctly', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const nodes = analyzer.getNodes();
      expect(nodes[0].type).toBe('synthetic');
      expect(nodes[1].type).toBe('object');
      expect(nodes[2].type).toBe('array');
      expect(nodes[3].type).toBe('object');
      expect(nodes[4].type).toBe('hidden');
    });

    it('should resolve node names from strings array', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const nodes = analyzer.getNodes();
      expect(nodes[0].name).toBe('(GC roots)');
      expect(nodes[1].name).toBe('App');
      expect(nodes[2].name).toBe('data');
      expect(nodes[3].name).toBe('Cache');
    });

    it('should parse self sizes correctly', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const nodes = analyzer.getNodes();
      expect(nodes[0].selfSize).toBe(0);
      expect(nodes[1].selfSize).toBe(256);
      expect(nodes[2].selfSize).toBe(1024);
      expect(nodes[3].selfSize).toBe(512);
    });

    it('should parse edges and link them to nodes', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const root = analyzer.getNodes()[0];
      expect(root.edges.length).toBe(2);
      expect(root.edges[0].type).toBe('property');
      expect(root.edges[0].nameOrIndex).toBe('app');
      expect(root.edges[0].toNode).toBe(1);
    });

    it('should build reverse graph (retainers)', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const app = analyzer.getNodes()[1];
      expect(app.retainers.length).toBe(1);
      expect(app.retainers[0].fromNode).toBe(0);
      expect(app.retainers[0].type).toBe('property');
    });

    it('should handle empty snapshot', () => {
      const raw = buildSnapshot({ nodes: [], edges: [], strings: [''] });
      analyzer.parse(raw);
      expect(analyzer.getNodes().length).toBe(0);
    });

    it('should parse detachedness field', () => {
      const raw = buildSnapshot({
        strings: ['', 'root', 'detached'],
        nodes: [
          {
            type: 9,
            name: 1,
            id: 1,
            selfSize: 0,
            edgeCount: 1,
            detachedness: 0,
          },
          {
            type: 3,
            name: 2,
            id: 2,
            selfSize: 100,
            edgeCount: 0,
            detachedness: 2,
          },
        ],
        edges: [{ type: 2, nameOrIndex: 2, toNode: 1 }],
      });
      analyzer.parse(raw);
      expect(analyzer.getNodes()[0].detachedness).toBe(0);
      expect(analyzer.getNodes()[1].detachedness).toBe(2);
    });
  });

  describe('dominator tree & retained sizes', () => {
    it('should compute retained size including dominated children', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const nodes = analyzer.getNodes();

      // App (256) dominates data (1024) and Cache (512) → retained = 256 + 1024 + 512
      expect(nodes[1].retainedSize).toBe(256 + 1024 + 512);
    });

    it('should give leaf nodes retainedSize == selfSize', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const data = analyzer.getNodes()[2];
      expect(data.retainedSize).toBe(data.selfSize);
    });

    it('should make root dominator of all reachable nodes', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const nodes = analyzer.getNodes();
      // Root dominates itself
      expect(nodes[0].dominatorId).toBe(0);
      // App is dominated by root
      expect(nodes[1].dominatorId).toBe(0);
    });
  });

  describe('query API', () => {
    it('getNodeById should find nodes by V8 stable id', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const app = analyzer.getNodeById(100);
      expect(app).toBeDefined();
      expect(app!.name).toBe('App');
    });

    it('getNodeById should return undefined for unknown id', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      expect(analyzer.getNodeById(99999)).toBeUndefined();
    });

    it('getTotalSize should sum all self sizes', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      expect(analyzer.getTotalSize()).toBe(0 + 256 + 1024 + 512 + 64);
    });

    it('getClassSummaries should group by constructor name', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const summaries = analyzer.getClassSummaries();

      const objectClass = summaries.find((s) => s.className === 'App');
      expect(objectClass).toBeDefined();
      expect(objectClass!.count).toBe(1);
      expect(objectClass!.shallowSize).toBe(256);
    });

    it('getTopRetainers should return nodes sorted by retained size', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const top = analyzer.getTopRetainers(3);
      expect(top.length).toBe(3);
      // Root should have highest retained size
      expect(top[0].retainedSize).toBeGreaterThanOrEqual(top[1].retainedSize);
    });

    it('getRetainerChain should build path to root', () => {
      const raw = createSimpleSnapshot();
      analyzer.parse(raw);
      const chain = analyzer.getRetainerChain(2); // data array
      expect(chain).toBeDefined();
      expect(chain!.nodeName).toBe('data');
      expect(chain!.chain.length).toBeGreaterThan(0);
      expect(chain!.chain[0].nodeName).toBe('App');
    });

    it('getDetachedNodes should find detached DOM nodes', () => {
      const raw = buildSnapshot({
        strings: ['', 'root', 'DetachedDiv'],
        nodes: [
          {
            type: 9,
            name: 1,
            id: 1,
            selfSize: 0,
            edgeCount: 1,
            detachedness: 0,
          },
          {
            type: 3,
            name: 2,
            id: 2,
            selfSize: 100,
            edgeCount: 0,
            detachedness: 2,
          },
        ],
        edges: [{ type: 2, nameOrIndex: 2, toNode: 1 }],
      });
      analyzer.parse(raw);
      const detached = analyzer.getDetachedNodes();
      expect(detached.length).toBe(1);
      expect(detached[0].name).toBe('DetachedDiv');
    });
  });

  describe('diff()', () => {
    it('should detect added objects between two snapshots', () => {
      const raw1 = createSimpleSnapshot(0);
      const raw2 = buildSnapshot({
        strings: [
          '',
          '(GC roots)',
          'App',
          'data',
          'Cache',
          'app',
          'cache',
          '(internal)',
          'NewObj',
        ],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 100, selfSize: 256, edgeCount: 2 },
          { type: 1, name: 3, id: 200, selfSize: 1024, edgeCount: 0 },
          { type: 3, name: 4, id: 300, selfSize: 512, edgeCount: 0 },
          { type: 0, name: 7, id: 400, selfSize: 64, edgeCount: 0 },
          // New object!
          { type: 3, name: 8, id: 500, selfSize: 2048, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 5, toNode: 1 },
          { type: 3, nameOrIndex: 7, toNode: 4 },
          { type: 2, nameOrIndex: 8, toNode: 5 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 6, toNode: 3 },
        ],
      });

      const analyzer1 = new HeapSnapshotAnalyzer();
      const analyzer2 = new HeapSnapshotAnalyzer();
      analyzer1.parse(raw1);
      analyzer2.parse(raw2);

      const diff = HeapSnapshotAnalyzer.diff(analyzer1, analyzer2);
      expect(diff.added.length).toBe(1);
      expect(diff.added[0].nodeId).toBe(500);
      expect(diff.added[0].selfSize).toBe(2048);
    });

    it('should detect removed objects between two snapshots', () => {
      const raw1 = createSimpleSnapshot(0);
      // Snapshot 2: missing the Cache object (id=300)
      const raw2 = buildSnapshot({
        strings: ['', '(GC roots)', 'App', 'data', 'app', '(internal)'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 2 },
          { type: 3, name: 2, id: 100, selfSize: 256, edgeCount: 1 },
          { type: 1, name: 3, id: 200, selfSize: 1024, edgeCount: 0 },
          { type: 0, name: 5, id: 400, selfSize: 64, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 4, toNode: 1 },
          { type: 3, nameOrIndex: 5, toNode: 3 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
        ],
      });

      const analyzer1 = new HeapSnapshotAnalyzer();
      const analyzer2 = new HeapSnapshotAnalyzer();
      analyzer1.parse(raw1);
      analyzer2.parse(raw2);

      const diff = HeapSnapshotAnalyzer.diff(analyzer1, analyzer2);
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].nodeId).toBe(300);
    });

    it('should compute net growth correctly', () => {
      const raw1 = createSimpleSnapshot(0);
      const analyzer1 = new HeapSnapshotAnalyzer();
      const analyzer2 = new HeapSnapshotAnalyzer();
      analyzer1.parse(raw1);
      analyzer2.parse(raw1); // same snapshot → no diff

      const diff = HeapSnapshotAnalyzer.diff(analyzer1, analyzer2);
      expect(diff.netGrowth).toBe(0);
      expect(diff.added.length).toBe(0);
      expect(diff.removed.length).toBe(0);
    });

    it('should identify class-level growth', () => {
      const raw1 = buildSnapshot({
        strings: ['', 'root', 'Leaky'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 1 },
          { type: 3, name: 2, id: 10, selfSize: 100, edgeCount: 0 },
        ],
        edges: [{ type: 2, nameOrIndex: 2, toNode: 1 }],
      });

      const raw2 = buildSnapshot({
        strings: ['', 'root', 'Leaky'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 10, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 100, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 2, toNode: 1 },
          { type: 2, nameOrIndex: 2, toNode: 2 },
          { type: 2, nameOrIndex: 2, toNode: 3 },
        ],
      });

      const analyzer1 = new HeapSnapshotAnalyzer();
      const analyzer2 = new HeapSnapshotAnalyzer();
      analyzer1.parse(raw1);
      analyzer2.parse(raw2);

      const diff = HeapSnapshotAnalyzer.diff(analyzer1, analyzer2);
      expect(diff.grown.length).toBeGreaterThan(0);
      const leakyGrowth = diff.grown.find((g) => g.className === 'Leaky');
      expect(leakyGrowth).toBeDefined();
      expect(leakyGrowth!.countDelta).toBe(2);
    });
  });

  describe('detectLeaks() — 3-snapshot technique', () => {
    it('should detect consistent growth as a leak', () => {
      // Snapshot 1: 1 Leaky object
      const raw1 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 1 },
          { type: 3, name: 2, id: 10, selfSize: 500, edgeCount: 0 },
        ],
        edges: [{ type: 2, nameOrIndex: 3, toNode: 1 }],
      });

      // Snapshot 2: 3 Leaky objects (grew by 2)
      const raw2 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 10, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 500, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 3, toNode: 3 },
        ],
      });

      // Snapshot 3: 5 Leaky objects (grew by 2 more — consistent!)
      const raw3 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 5 },
          { type: 3, name: 2, id: 10, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 13, selfSize: 500, edgeCount: 0 },
          { type: 3, name: 2, id: 14, selfSize: 500, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 3, toNode: 3 },
          { type: 2, nameOrIndex: 3, toNode: 4 },
          { type: 2, nameOrIndex: 3, toNode: 5 },
        ],
      });

      const a1 = new HeapSnapshotAnalyzer();
      const a2 = new HeapSnapshotAnalyzer();
      const a3 = new HeapSnapshotAnalyzer();
      a1.parse(raw1);
      a2.parse(raw2);
      a3.parse(raw3);

      const report = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);

      expect(report.leakCandidates.length).toBeGreaterThan(0);
      const leaky = report.leakCandidates.find((c) => c.className === 'Leaky');
      expect(leaky).toBeDefined();
      expect(leaky!.confidence).toBe('high');
      expect(leaky!.countInSnapshot1).toBe(1);
      expect(leaky!.countInSnapshot2).toBe(3);
      expect(leaky!.countInSnapshot3).toBe(5);
      expect(leaky!.growthRate).toBe(2); // 2 objects per interval
    });

    it('should not flag one-time allocations as leaks', () => {
      // Snapshot 1: 0 objects of type Alloc
      const raw1 = buildSnapshot({
        strings: ['', 'root'],
        nodes: [{ type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 0 }],
        edges: [],
      });

      // Snapshot 2: 3 Alloc objects (one-time allocation)
      const raw2 = buildSnapshot({
        strings: ['', 'root', 'Alloc', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 10, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 100, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 3, toNode: 3 },
        ],
      });

      // Snapshot 3: STILL 3 Alloc objects (no further growth → not a leak)
      const raw3 = buildSnapshot({
        strings: ['', 'root', 'Alloc', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 10, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 100, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 100, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 3, toNode: 3 },
        ],
      });

      const a1 = new HeapSnapshotAnalyzer();
      const a2 = new HeapSnapshotAnalyzer();
      const a3 = new HeapSnapshotAnalyzer();
      a1.parse(raw1);
      a2.parse(raw2);
      a3.parse(raw3);

      const report = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);
      const allocLeak = report.leakCandidates.find(
        (c) => c.className === 'Alloc',
      );
      expect(allocLeak).toBeUndefined();
    });

    it('should generate a human-readable summary', () => {
      const raw1 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 1 },
          { type: 3, name: 2, id: 10, selfSize: 1024, edgeCount: 0 },
        ],
        edges: [{ type: 2, nameOrIndex: 3, toNode: 1 }],
      });

      const raw2 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 2 },
          { type: 3, name: 2, id: 10, selfSize: 1024, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 1024, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
        ],
      });

      const raw3 = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 3 },
          { type: 3, name: 2, id: 10, selfSize: 1024, edgeCount: 0 },
          { type: 3, name: 2, id: 11, selfSize: 1024, edgeCount: 0 },
          { type: 3, name: 2, id: 12, selfSize: 1024, edgeCount: 0 },
        ],
        edges: [
          { type: 2, nameOrIndex: 3, toNode: 1 },
          { type: 2, nameOrIndex: 3, toNode: 2 },
          { type: 2, nameOrIndex: 3, toNode: 3 },
        ],
      });

      const a1 = new HeapSnapshotAnalyzer();
      const a2 = new HeapSnapshotAnalyzer();
      const a3 = new HeapSnapshotAnalyzer();
      a1.parse(raw1);
      a2.parse(raw2);
      a3.parse(raw3);

      const report = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);
      expect(report.summary).toContain('Heap growth');
      expect(typeof report.summary).toBe('string');
      expect(report.summary.length).toBeGreaterThan(0);
    });

    it('should include recommendations', () => {
      const raw = buildSnapshot({
        strings: ['', 'root', 'Leaky', 'ref'],
        nodes: [
          { type: 9, name: 1, id: 1, selfSize: 0, edgeCount: 1 },
          { type: 3, name: 2, id: 10, selfSize: 100, edgeCount: 0 },
        ],
        edges: [{ type: 2, nameOrIndex: 3, toNode: 1 }],
      });

      const a1 = new HeapSnapshotAnalyzer();
      const a2 = new HeapSnapshotAnalyzer();
      const a3 = new HeapSnapshotAnalyzer();
      a1.parse(raw);
      a2.parse(raw);
      a3.parse(raw);

      const report = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should return snapshot sizes in the report', () => {
      const raw = createSimpleSnapshot();
      const a1 = new HeapSnapshotAnalyzer();
      const a2 = new HeapSnapshotAnalyzer();
      const a3 = new HeapSnapshotAnalyzer();
      a1.parse(raw);
      a2.parse(raw);
      a3.parse(raw);

      const report = HeapSnapshotAnalyzer.detectLeaks(a1, a2, a3);
      expect(report.snapshotSizes).toHaveLength(3);
      expect(report.snapshotSizes[0]).toBe(0 + 256 + 1024 + 512 + 64);
    });
  });

  describe('leakReportToMarkdown()', () => {
    it('should generate valid markdown', () => {
      const report: LeakReport = {
        timestamp: '2026-03-27T00:00:00Z',
        snapshotSizes: [1_000_000, 1_500_000, 2_000_000],
        leakCandidates: [
          {
            className: 'LeakyWidget',
            countInSnapshot1: 10,
            countInSnapshot2: 30,
            countInSnapshot3: 50,
            growthRate: 20,
            totalLeakedSize: 40_000,
            retainerChains: [],
            confidence: 'high',
          },
        ],
        summary: 'Heap growing consistently',
        recommendations: ['Check LeakyWidget lifecycle'],
      };

      const md = HeapSnapshotAnalyzer.leakReportToMarkdown(report);
      expect(md).toContain('# Memory Leak Investigation Report');
      expect(md).toContain('LeakyWidget');
      expect(md).toContain('high');
      expect(md).toContain('## Recommendations');
    });
  });
});
